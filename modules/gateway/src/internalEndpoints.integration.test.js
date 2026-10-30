import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {after, before, describe, mock, test} from 'node:test'

import express from 'express'
import {Subject} from 'rxjs'

// The user module's internal endpoints, which skip authentication and rate limiting: over real HTTP,
// through the real user middleware, authentication middleware and proxy, to a stand-in for the user
// module that serves them, matching paths case-insensitively as its router does.

const ALICE = {id: 1, username: 'alice', roles: [], status: 'ACTIVE'}
const PASSWORD = 'password'

const listen = app => new Promise(resolve => {
    const server = createServer(app)
    server.listen(0, '127.0.0.1', () => resolve(server))
})

const upstream = await startUpstream()

mock.module('../config/modules.json', {
    exports: {
        default: {user: upstream.address}
    }
})

// The real configuration parses process arguments at import and exits the process when a mandatory
// one is missing, which under a test runner they all are.
mock.module('./config.js', {
    exports: {
        sepalHost: 'sepal.test',
        sepalAppsHost: 'apps.test'
    }
})

const {AuthMiddleware} = await import('./authMiddleware.js')
const {GoogleAccessTokenMiddleware} = await import('./googleAccessTokenMiddleware.js')
const {Proxy} = await import('./proxy.js')
const {UserStore} = await import('./userStore.js')

describe('the user module\'s internal endpoints', () => {
    test('are not found through the gateway, even by an authenticated user', async () => {
        assert.equal((await request('POST', '/api/user/auth/password')).status, 404)
        assert.equal((await request('GET', '/api/user/auth/authorized-keys')).status, 404)
        assert.equal((await request('GET', '/api/user/nss/snapshot')).status, 404)
    })

    test('are not found however the path is cased', async () => {
        assert.equal((await request('POST', '/api/user/AUTH/password')).status, 404)
        assert.equal((await request('GET', '/api/user/Nss/snapshot')).status, 404)
    })
})

describe('the user module\'s other endpoints', () => {
    test('stay reachable through the gateway', async () => {
        const {status, body} = await request('GET', '/api/user/echo')

        assert.equal(status, 200)
        assert.equal(body, 'echo')
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

const request = async (method, path) => {
    const response = await fetch(`${gatewayUrl}${path}`, {
        method,
        headers: {
            'Authorization': `Basic ${Buffer.from(`${ALICE.username}:${PASSWORD}`).toString('base64')}`,
            'No-auth-challenge': 'true'
        }
    })
    return {status: response.status, body: await response.text()}
}

async function startUpstream() {
    const app = express()
    app.use(express.urlencoded({extended: false}))
    app.post('/authenticate', (req, res) => {
        const {username, password} = req.body
        username === ALICE.username && password === PASSWORD
            ? res.json(ALICE)
            : res.status(401).json({})
    })
    app.post('/auth/password', (_req, res) => res.json(ALICE))
    app.get('/auth/authorized-keys', (_req, res) => res.send('ssh-ed25519 AAAA alice'))
    app.get('/nss/snapshot', (_req, res) => res.json([ALICE]))
    app.get('/echo', (_req, res) => res.send('echo'))
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

// node:test may run a root-level before hook while this file is still being evaluated, so the hooks
// are registered after the helpers they call.
let gateway

before(async () => {
    gateway = await startGateway()
})

after(async () => {
    await Promise.all([gateway.close(), upstream.close()])
})
