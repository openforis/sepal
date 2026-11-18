import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {after, before, beforeEach, describe, mock, test} from 'node:test'

import express from 'express'
import {firstValueFrom, Subject} from 'rxjs'

import {MemoryRedis} from './testSupport/memoryRedis.js'

// What a module downstream of the gateway is told about who is calling: over real HTTP, through the
// real user middleware, authentication middleware and proxy, to a stand-in for the worker module
// that echoes the headers it was sent. The user module is stood in for as well.

const ALICE = {id: 1, username: 'alice', roles: [], status: 'ACTIVE'}
const BOB = {id: 2, username: 'bob', roles: [], status: 'ACTIVE'}
const CAROL = {id: 3, username: 'carol', roles: [], status: 'LOCKED'}
const DAVE = {id: 4, username: 'dave', roles: ['application_admin'], status: 'ACTIVE', revision: 1}
const DEMOTED_DAVE = {...DAVE, roles: [], revision: 2}
const LOCKED_DAVE = {...DEMOTED_DAVE, status: 'LOCKED', revision: 3}
const DAVE_SESSION_KEY = 'dave-session-key'
const DAVE_TASK_KEY = 'task_dave-key'
const DAVE_SESSION = {sessionId: 's-dave', username: 'dave', workerType: 'sandbox'}

const EXECUTOR_KEY = 'executor-key'
const SANDBOX_KEY = 'sandbox-key'
const TASK_KEY = 'task_container-key'
const LOCKED_SESSION_KEY = 'locked-session-key'
const LOCKED_TASK_KEY = 'task_locked-key'
const EXECUTOR_SESSION = {sessionId: 's-executor', username: 'alice', workerType: 'sandbox'}
const SANDBOX_SESSION = {sessionId: 's-sandbox', username: 'bob', workerType: 'sandbox'}
const LOCKED_SESSION = {sessionId: 's-locked', username: 'carol', workerType: 'sandbox'}

const FORGED = JSON.stringify({sessionId: 's-forged', workerType: 'sandbox'})
const FORGED_USER = JSON.stringify({username: 'admin', roles: ['application_admin'], status: 'ACTIVE'})

const parse = value => (value ? JSON.parse(value) : null)

const listen = app => new Promise(resolve => {
    const server = createServer(app)
    server.listen(0, '127.0.0.1', () => resolve(server))
})

const upstream = await startUpstream()

mock.module('../config/modules.json', {
    exports: {
        default: {worker: upstream.address, user: upstream.address, taskManager: upstream.address}
    }
})

// The real configuration parses process arguments at import and exits the process when a mandatory
// one is missing, which under a test runner they all are.
mock.module('./config.js', {
    exports: {
        sepalHost: 'sepal.test'
    }
})

const {AuthMiddleware} = await import('./authMiddleware.js')
const {GoogleAccessTokenMiddleware} = await import('./googleAccessTokenMiddleware.js')
const {Proxy} = await import('./proxy.js')
const {UserStore} = await import('./userStore.js')

describe('a request authenticated with a worker session api key', () => {
    test('names the session\'s owner and the session it was authenticated as', async () => {
        const {status, body} = await probe({apiKey: EXECUTOR_KEY})

        assert.equal(status, 200)
        assert.partialDeepStrictEqual(body.user, {username: 'alice'})
        assert.deepEqual(body.session, {sessionId: 's-executor', workerType: 'sandbox'})
    })

    test('passes on neither the key nor a role for it', async () => {
        const {body} = await probe({apiKey: EXECUTOR_KEY})

        assert.ok(!JSON.stringify(body).includes(EXECUTOR_KEY))
        assert.deepEqual(body.user.roles, [])
    })

    test('names an interactive sandbox as the sandbox session it is', async () => {
        const {body} = await probe({apiKey: SANDBOX_KEY})

        assert.partialDeepStrictEqual(body.user, {username: 'bob'})
        assert.deepEqual(body.session, {sessionId: 's-sandbox', workerType: 'sandbox'})
    })

    test('replaces a session the caller claimed with the one its key resolves to', async () => {
        const {body} = await probe({apiKey: SANDBOX_KEY, claimedSession: FORGED})

        assert.deepEqual(body.session, {sessionId: 's-sandbox', workerType: 'sandbox'})
    })

    test('is refused when the key is unknown or empty', async () => {
        assert.equal((await probe({apiKey: 'no-such-key'})).status, 401)
        assert.equal((await probe({apiKey: ''})).status, 401)
    })

    test('is refused when the session\'s owner is locked', async () => {
        assert.equal((await probe({apiKey: LOCKED_SESSION_KEY})).status, 401)
    })
})

describe('a request authenticated with a task container\'s key', () => {
    test('names the task\'s owner and the task it was authenticated as', async () => {
        const {status, body} = await probe({apiKey: TASK_KEY})

        assert.equal(status, 200)
        assert.partialDeepStrictEqual(body.user, {username: 'alice'})
        assert.deepEqual(body.session, {workerType: 'task', taskId: 't-1'})
    })

    test('is refused when task-manager does not know the key', async () => {
        assert.equal((await probe({apiKey: 'task_unknown'})).status, 401)
    })

    test('is refused when the task\'s owner is locked', async () => {
        assert.equal((await probe({apiKey: LOCKED_TASK_KEY})).status, 401)
    })
})

// The user module and the key owners answer from the database, and the user cache can learn of a newer change while
// that answer is on its way.
describe('a request whose user changes while it is authenticated', () => {
    const credentials = {
        'ordinary credentials, not from a browser': {username: 'dave', password: 'daves-password', browser: false, lookup: 'authenticate'},
        'a worker session api key': {apiKey: DAVE_SESSION_KEY, lookup: 'info'},
        'a task api key': {apiKey: DAVE_TASK_KEY, lookup: 'info'}
    }

    beforeEach(() => {
        gateway.redis.values.clear()
        gateway.sessions.length = 0
    })

    for (const [name, {lookup, ...presented}] of Object.entries(credentials)) {
        test(`with ${name} is forwarded as demoted when the demotion becomes known first`, async () => {
            const held = upstream.hold(lookup)

            const pending = probe(presented)
            await held.reached
            await firstValueFrom(gateway.userStore.setUser$(DEMOTED_DAVE))
            held.release()
            const {status, body} = await pending

            assert.equal(status, 200)
            assert.partialDeepStrictEqual(body.user, {username: 'dave', status: 'ACTIVE'})
            assert.deepEqual(body.user.roles, [])
            assert.ok(gateway.sessions.every(session => session.username === undefined))
        })

        test(`with ${name} is refused when a lock becomes known first`, async () => {
            const held = upstream.hold(lookup)

            const pending = probe(presented)
            await held.reached
            await firstValueFrom(gateway.userStore.setUser$(LOCKED_DAVE))
            held.release()
            const {status, challenge} = await pending

            assert.equal(status, 401)
            assert.equal(challenge, presented.browser === false ? 'Basic realm="Sepal"' : null)
            assert.ok(gateway.sessions.every(session => session.username === undefined))
        })
    }
})

describe('a request to an unauthenticated endpoint', () => {
    test('reaches the module with no session, whatever the caller claimed', async () => {
        const {status, body} = await probeUnauthenticated(FORGED)

        assert.equal(status, 200)
        assert.equal(body.session, null)
    })

    test('reaches the module with no user, whatever user the caller claimed', async () => {
        const {status, body} = await probeUnauthenticated(undefined, FORGED_USER)

        assert.equal(status, 200)
        assert.equal(body.user, null)
    })
})

describe('a request without credentials', () => {
    test('is refused, whatever user the caller claimed', async () => {
        assert.equal((await probe({claimedUser: FORGED_USER})).status, 401)
    })
})

describe('a request authenticated the ordinary way', () => {
    test('carries no session, whatever the caller claimed', async () => {
        const {status, body} = await probe({
            username: 'alice', password: 'alices-password', claimedSession: FORGED
        })

        assert.equal(status, 200)
        assert.partialDeepStrictEqual(body.user, {username: 'alice'})
        assert.equal(body.session, null)
    })
})

let gatewayUrl

const startGateway = async () => {
    const redis = new MemoryRedis()
    const sessions = []
    const userStore = UserStore(redis, new Subject())
    const {authMiddleware} = AuthMiddleware(userStore, async () => {})
    const {googleAccessTokenMiddleware} = GoogleAccessTokenMiddleware(userStore)
    const app = express()
    // No browser login: these requests arrive with credentials, not a cookie.
    app.use((req, _res, next) => {
        req.session = {}
        sessions.push(req.session)
        next()
    })
    app.use(userStore.userMiddleware)
    Proxy(userStore, authMiddleware, googleAccessTokenMiddleware).proxyEndpoints(app)
    const server = await listen(app)
    gatewayUrl = `http://127.0.0.1:${server.address().port}`
    return {redis, sessions, userStore, close: () => new Promise(resolve => server.close(resolve))}
}

// /api/tasks is the authenticated endpoint the executor callbacks travel over; /api/sessions/expiry
// is the one endpoint that is deliberately unauthenticated.
const probe = ({apiKey, username = '', password, browser, claimedSession, claimedUser}) =>
    request('/api/tasks/echo', {apiKey, username, password, browser, claimedSession, claimedUser})

const probeUnauthenticated = (claimedSession, claimedUser) =>
    request('/api/sessions/expiry/echo', {claimedSession, claimedUser})

const request = async (path, {apiKey, username = '', password, browser = true, claimedSession, claimedUser}) => {
    const credentials = apiKey === undefined ? `${username}:${password}` : `:${apiKey}`
    const response = await fetch(`${gatewayUrl}${path}`, {
        headers: {
            ...(password === undefined && apiKey === undefined
                ? {}
                : {'Authorization': `Basic ${Buffer.from(credentials).toString('base64')}`}),
            ...(browser ? {'No-auth-challenge': 'true'} : {}),
            ...(claimedSession ? {'sepal-session': claimedSession} : {}),
            ...(claimedUser ? {'sepal-user': claimedUser} : {})
        }
    })
    return {
        status: response.status,
        body: response.status === 200 ? await response.json() : null,
        challenge: response.headers.get('www-authenticate')
    }
}

async function startUpstream() {
    const sessionsByKey = {
        [EXECUTOR_KEY]: EXECUTOR_SESSION,
        [SANDBOX_KEY]: SANDBOX_SESSION,
        [LOCKED_SESSION_KEY]: LOCKED_SESSION,
        [DAVE_SESSION_KEY]: DAVE_SESSION
    }
    const tasksByKey = {
        [TASK_KEY]: {username: 'alice', taskId: 't-1'},
        [LOCKED_TASK_KEY]: {username: 'carol', taskId: 't-2'},
        [DAVE_TASK_KEY]: {username: 'dave', taskId: 't-3'}
    }
    const usersByName = {alice: ALICE, bob: BOB, carol: CAROL, dave: DAVE}
    const passwords = {alice: 'alices-password', dave: 'daves-password'}
    // A held lookup answers once released.
    const holds = {}
    const hold = lookup => {
        const reached = Promise.withResolvers()
        const released = Promise.withResolvers()
        holds[lookup] = {reached, released}
        return {reached: reached.promise, release: () => released.resolve()}
    }
    const heldUntilReleased = async lookup => {
        const held = holds[lookup]
        if (held) {
            delete holds[lookup]
            held.reached.resolve()
            await held.released.promise
        }
    }

    const app = express()
    app.use(express.urlencoded({extended: false}))
    app.post('/sessions/api-key-authenticate', (req, res) => {
        const session = sessionsByKey[req.body.apiKey]
        session ? res.json(session) : res.status(401).json({})
    })
    app.post('/tasks/api-key-authenticate', (req, res) => {
        const task = tasksByKey[req.body.apiKey]
        task ? res.json(task) : res.status(401).json({})
    })
    app.post('/authenticate', async (req, res) => {
        const {username, password} = req.body
        await heldUntilReleased('authenticate')
        passwords[username] === password ? res.json(usersByName[username]) : res.status(401).json({})
    })
    app.get('/info', async (req, res) => {
        const user = usersByName[req.query.username]
        await heldUntilReleased('info')
        user ? res.json(user) : res.status(401).json({})
    })
    // What the worker module sees once the proxy has forwarded the request.
    const echo = (req, res) => res.json({
        user: parse(req.headers['sepal-user']),
        session: parse(req.headers['sepal-session'])
    })
    app.get('/tasks/echo', echo)
    app.get('/sessions/expiry/echo', echo)
    const server = await listen(app)
    return {
        address: `127.0.0.1:${server.address().port}`,
        hold,
        close: () => new Promise(resolve => server.close(resolve))
    }
}

// node:test may run a root-level before hook while this file is still being evaluated, so the hooks
// are registered after the helpers they call.
let gateway

before(async () => {
    gateway = await startGateway()
})

after(async () => {
    await Promise.all([gateway.close(), upstream.close()])
})
