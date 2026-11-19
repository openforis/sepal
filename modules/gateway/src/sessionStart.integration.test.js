import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {after, afterEach, beforeEach, describe, mock, test} from 'node:test'

import express from 'express'
import Session from 'express-session'
import {firstValueFrom, Subject} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

import {MemoryRedis} from './testSupport/memoryRedis.js'

// Browser logins and password resets over real HTTP and real express sessions, with the user module stood in for. A
// login on a session another user holds replaces that session first; the session store can hold that replacement, so
// the account can be locked while it is under way.

const ALICE = {id: 1, username: 'alice', status: 'ACTIVE', roles: [], revision: 1}
const BOB = {id: 2, username: 'bob', status: 'ACTIVE', roles: ['application_admin'], revision: 1}
const LOCKED_BOB = {...BOB, status: 'LOCKED', revision: 2}
const PASSWORDS = {alice: 'alice-pw', bob: 'bob-pw'}
const RESET_TOKEN = 'reset-token'

const listen = app => new Promise(resolve => {
    const server = createServer(app)
    server.listen(0, '127.0.0.1', () => resolve(server))
})

const upstream = await startUpstream()

mock.module('../config/modules.json', {
    exports: {default: {user: upstream.address, worker: upstream.address, taskManager: upstream.address}}
})

configureNoLogging()
const {AuthMiddleware} = await import('./authMiddleware.js')
const {passwordResetRoute} = await import('./passwordResetRoute.js')
const {SessionManager} = await import('./session.js')
const {UserStore} = await import('./userStore.js')
const {userSessionStarter} = await import('./userSession.js')

describe('starting a browser session on a session another user holds', () => {
    let gateway

    beforeEach(async () => {
        gateway = await startGateway()
    })

    afterEach(() => gateway.close())

    after(() => upstream.close())

    test('a login is answered as the user and the session names them', async () => {
        const alice = await gateway.loggedIn('alice')

        const response = await gateway.login('bob', alice)

        assert.equal(response.status, 200)
        assert.deepEqual(response.body, {id: 2, username: 'bob', status: 'ACTIVE', roles: ['application_admin']})
        assert.deepEqual(await gateway.sessionUsernames(), ['bob'])
    })

    test('a login is refused, and no session names the user, when the user is locked while it is replaced', async () => {
        const alice = await gateway.loggedIn('alice')
        const held = gateway.sessionStore.holdNextDestroy()

        const pending = gateway.login('bob', alice)
        await held.reached
        await firstValueFrom(gateway.userStore.setUser$(LOCKED_BOB))
        held.release()
        const response = await pending

        assert.equal(response.status, 401)
        assert.ok(!(await gateway.sessionUsernames()).includes('bob'))
    })

    test('a login fails, and no session names the user, when the user cannot be read once it is replaced', async () => {
        const alice = await gateway.loggedIn('alice')
        const held = gateway.sessionStore.holdNextDestroy()

        const pending = gateway.login('bob', alice)
        await held.reached
        gateway.redis.get = async () => {
            throw new Error('Redis unavailable')
        }
        held.release()
        const response = await pending

        assert.equal(response.status, 500)
        assert.ok(!(await gateway.sessionUsernames()).includes('bob'))
    })

    test('a password reset is refused, and no session names the user, when the user is locked while it is replaced', async () => {
        const alice = await gateway.loggedIn('alice')
        const held = gateway.sessionStore.holdNextDestroy()

        const pending = gateway.reset(alice)
        await held.reached
        await firstValueFrom(gateway.userStore.setUser$(LOCKED_BOB))
        held.release()
        const response = await pending

        assert.equal(response.status, 401)
        assert.equal(response.body, null)
        assert.ok(!(await gateway.sessionUsernames()).includes('bob'))
    })
})

const startGateway = async () => {
    const redis = new MemoryRedis()
    const sessionStore = new HoldingStore()
    const event$ = new Subject()
    const userStore = UserStore(redis, event$)
    const {ensureSessionFor} = SessionManager(sessionStore, redis, event$)
    const {authMiddleware} = AuthMiddleware(userStore, ensureSessionFor)
    const app = express()
    app.use(Session({
        store: sessionStore, secret: 'test-secret', name: 'SEPAL-SESSIONID',
        resave: false, saveUninitialized: false, unset: 'destroy'
    }))
    app.use(userStore.userMiddleware)
    app.post('/api/user/password/reset', passwordResetRoute(userSessionStarter(userStore, ensureSessionFor)))
    // Stands in for the proxy: answers with the user the request would be forwarded as.
    app.post('/api/user/login', authMiddleware, (req, res) => res.json(JSON.parse(req.headers['sepal-user'])))
    const server = await listen(app)
    const url = `http://127.0.0.1:${server.address().port}`

    const login = (username, cookie) => post(`${url}/api/user/login`, {
        'Authorization': `Basic ${Buffer.from(`${username}:${PASSWORDS[username]}`).toString('base64')}`,
        'No-auth-challenge': 'true',
        ...(cookie ? {Cookie: cookie} : {})
    })
    return {
        redis, sessionStore, userStore, login,
        loggedIn: async username => (await login(username)).cookie,
        reset: cookie => post(`${url}/api/user/password/reset`, {
            'Content-Type': 'application/json',
            Cookie: cookie
        }, JSON.stringify({token: RESET_TOKEN, password: 'new-password'})),
        sessionUsernames: () => new Promise((resolve, reject) => sessionStore.all((error, sessions) =>
            error ? reject(error) : resolve(Object.values(sessions ?? {}).map(({username}) => username))
        )),
        close: () => new Promise(resolve => server.close(resolve))
    }
}

const post = async (url, headers, body) => {
    const response = await fetch(url, {method: 'POST', headers, body})
    const text = await response.text()
    return {
        status: response.status,
        body: text ? JSON.parse(text) : null,
        cookie: response.headers.getSetCookie()[0]?.split(';')[0]
    }
}

// Holds the next session destruction until released, as a slow store round trip would.
class HoldingStore extends Session.MemoryStore {
    #held = null

    holdNextDestroy() {
        const reached = Promise.withResolvers()
        const released = Promise.withResolvers()
        this.#held = {reached, released}
        return {reached: reached.promise, release: () => released.resolve()}
    }

    destroy(sessionId, callback) {
        const held = this.#held
        if (!held) {
            return super.destroy(sessionId, callback)
        }
        this.#held = null
        held.reached.resolve()
        held.released.promise.then(() => super.destroy(sessionId, callback))
    }
}

async function startUpstream() {
    const users = {alice: ALICE, bob: BOB}
    const app = express()
    app.use(express.urlencoded({extended: false}))
    app.use(express.json())
    app.post('/authenticate', (req, res) => {
        const {username, password} = req.body
        PASSWORDS[username] === password ? res.json(users[username]) : res.status(401).json({})
    })
    app.post('/password/reset', (req, res) => {
        req.body.token === RESET_TOKEN ? res.json(BOB) : res.status(400).json({message: 'Invalid token'})
    })
    app.get('/current', (req, res) => res.json(users[JSON.parse(req.headers['sepal-user']).username]))
    const server = await listen(app)
    return {
        address: `127.0.0.1:${server.address().port}`,
        close: () => new Promise(resolve => server.close(resolve))
    }
}
