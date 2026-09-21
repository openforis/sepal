import {jest} from '@jest/globals'
import express from 'express'
import {createServer} from 'http'
import {Subject} from 'rxjs'

// What a module downstream of the gateway is told about who is calling: over real HTTP, through the
// real user middleware, authentication middleware and proxy, to a stand-in for the worker module
// that echoes the headers it was sent. The user module is stood in for as well.

const ALICE = {id: 1, username: 'alice', roles: [], status: 'ACTIVE'}
const BOB = {id: 2, username: 'bob', roles: [], status: 'ACTIVE'}

const EXECUTOR_KEY = 'executor-key'
const SANDBOX_KEY = 'sandbox-key'
const EXECUTOR_SESSION = {sessionId: 's-executor', username: 'alice', workerType: 'task-executor'}
const SANDBOX_SESSION = {sessionId: 's-sandbox', username: 'bob', workerType: 'sandbox'}

const FORGED = JSON.stringify({sessionId: 's-forged', workerType: 'task-executor'})

const parse = value => (value ? JSON.parse(value) : null)

const listen = app => new Promise(resolve => {
    const server = createServer(app)
    server.listen(0, '127.0.0.1', () => resolve(server))
})

const upstream = await startUpstream()

jest.unstable_mockModule('../config/modules.json', () => ({
    default: {worker: upstream.address, user: upstream.address}
}))

// The real configuration parses process arguments at import and exits the process when a mandatory
// one is missing, which under a test runner they all are.
jest.unstable_mockModule('./config.js', () => ({
    sepalHost: 'sepal.test',
    sepalAppsHost: 'apps.test'
}))

const {AuthMiddleware} = await import('./authMiddleware.js')
const {GoogleAccessTokenMiddleware} = await import('./googleAccessTokenMiddleware.js')
const {Proxy} = await import('./proxy.js')
const {UserStore} = await import('./userStore.js')

let gateway

beforeAll(async () => {
    gateway = await startGateway()
})

afterAll(async () => {
    await Promise.all([gateway.close(), upstream.close()])
})

describe('a request authenticated with a worker session api key', () => {
    test('names the session\'s owner and the session it was authenticated as', async () => {
        const {status, body} = await probe({apiKey: EXECUTOR_KEY})

        expect(status).toBe(200)
        expect(body.user).toMatchObject({username: 'alice'})
        expect(body.session).toEqual({sessionId: 's-executor', workerType: 'task-executor'})
    })

    test('passes on neither the key nor a role for it', async () => {
        const {body} = await probe({apiKey: EXECUTOR_KEY})

        expect(JSON.stringify(body)).not.toContain(EXECUTOR_KEY)
        expect(body.user.roles).toEqual([])
    })

    test('names an interactive sandbox as the sandbox session it is', async () => {
        const {body} = await probe({apiKey: SANDBOX_KEY})

        expect(body.user).toMatchObject({username: 'bob'})
        expect(body.session).toEqual({sessionId: 's-sandbox', workerType: 'sandbox'})
    })

    test('replaces a session the caller claimed with the one its key resolves to', async () => {
        const {body} = await probe({apiKey: SANDBOX_KEY, claimedSession: FORGED})

        expect(body.session).toEqual({sessionId: 's-sandbox', workerType: 'sandbox'})
    })

    test('is refused when the key is unknown or empty', async () => {
        expect((await probe({apiKey: 'no-such-key'})).status).toBe(401)
        expect((await probe({apiKey: ''})).status).toBe(401)
    })
})

describe('a request to an unauthenticated endpoint', () => {
    test('reaches the module with no session, whatever the caller claimed', async () => {
        const {status, body} = await probeUnauthenticated(FORGED)

        expect(status).toBe(200)
        expect(body.session).toBeNull()
    })
})

describe('a request authenticated the ordinary way', () => {
    test('carries no session, whatever the caller claimed', async () => {
        const {status, body} = await probe({
            username: 'alice', password: 'alices-password', claimedSession: FORGED
        })

        expect(status).toBe(200)
        expect(body.user).toMatchObject({username: 'alice'})
        expect(body.session).toBeNull()
    })
})

let gatewayUrl

const startGateway = async () => {
    const userStore = UserStore(fakeRedis(), new Subject())
    const {authMiddleware} = AuthMiddleware(userStore, async () => {})
    const {googleAccessTokenMiddleware} = GoogleAccessTokenMiddleware(userStore)
    const app = express()
    // No browser login: these requests arrive with credentials, not a cookie.
    app.use((req, _res, next) => {
        req.session = {}
        next()
    })
    app.use(userStore.userMiddleware)
    Proxy(userStore, authMiddleware, googleAccessTokenMiddleware).proxyEndpoints(app)
    const server = await listen(app)
    gatewayUrl = `http://127.0.0.1:${server.address().port}`
    return {close: () => new Promise(resolve => server.close(resolve))}
}

// /api/tasks is the authenticated endpoint the executor callbacks travel over; /api/sessions/expiry
// is the one endpoint that is deliberately unauthenticated.
const probe = ({apiKey, username = '', password, claimedSession}) =>
    request('/api/tasks/echo', {apiKey, username, password, claimedSession})

const probeUnauthenticated = claimedSession =>
    request('/api/sessions/expiry/echo', {claimedSession})

const request = async (path, {apiKey, username = '', password, claimedSession}) => {
    const credentials = apiKey === undefined ? `${username}:${password}` : `:${apiKey}`
    const response = await fetch(`${gatewayUrl}${path}`, {
        headers: {
            ...(password === undefined && apiKey === undefined
                ? {}
                : {'Authorization': `Basic ${Buffer.from(credentials).toString('base64')}`}),
            'No-auth-challenge': 'true',
            ...(claimedSession ? {'sepal-session': claimedSession} : {})
        }
    })
    return {
        status: response.status,
        body: response.status === 200 ? await response.json() : null
    }
}

async function startUpstream() {
    const sessionsByKey = {[EXECUTOR_KEY]: EXECUTOR_SESSION, [SANDBOX_KEY]: SANDBOX_SESSION}
    const usersByName = {alice: ALICE, bob: BOB}
    const passwords = {alice: 'alices-password'}

    const app = express()
    app.use(express.urlencoded({extended: false}))
    app.post('/sessions/api-key-authenticate', (req, res) => {
        const session = sessionsByKey[req.body.apiKey]
        session ? res.json(session) : res.status(401).json({})
    })
    app.post('/authenticate', (req, res) => {
        const {username, password} = req.body
        passwords[username] === password ? res.json(usersByName[username]) : res.status(401).json({})
    })
    app.get('/info', (req, res) => {
        const user = usersByName[req.query.username]
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
        close: () => new Promise(resolve => server.close(resolve))
    }
}

const fakeRedis = () => {
    const values = new Map()
    return {
        get: async key => values.get(key) ?? null,
        set: async (key, value) => {
            const previous = values.get(key) ?? null
            values.set(key, value)
            return previous
        }
    }
}
