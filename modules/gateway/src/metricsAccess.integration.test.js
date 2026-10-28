import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {after, before, describe, mock, test} from 'node:test'

import express from 'express'
import {Subject} from 'rxjs'

// Who may read the modules' Prometheus metrics through the gateway: over real HTTP, through the real
// user middleware, authentication middleware and proxy, to a stand-in for the modules that serves
// /metrics as exactly as Koa's metrics middleware does. The user module is stood in for as well.

const ADMIN = {id: 1, username: 'admin', roles: ['application_admin'], status: 'ACTIVE'}
const ALICE = {id: 2, username: 'alice', roles: [], status: 'ACTIVE'}
const PASSWORD = 'password'

const METRICS = 'sepal_instance_cpu_pct{username="alice"} 42'

const listen = app => new Promise(resolve => {
    const server = createServer(app)
    server.listen(0, '127.0.0.1', () => resolve(server))
})

const upstream = await startUpstream()

mock.module('../config/modules.json', {
    exports: {
        default: {gee: upstream.address, worker: upstream.address, user: upstream.address}
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
const {restrictMetricsToAdmins} = await import('./metricsAccess.js')
const {Proxy} = await import('./proxy.js')
const {UserStore} = await import('./userStore.js')

describe('a module\'s metrics', () => {
    test('are served to an admin', async () => {
        const {status, body} = await request('/api/gee/metrics', ADMIN)

        assert.equal(status, 200)
        assert.equal(body, METRICS)
    })

    test('are refused to a user who is not an admin', async () => {
        assert.equal((await request('/api/gee/metrics', ALICE)).status, 403)
        assert.equal((await request('/api/gee/metrics.json', ALICE)).status, 403)
        assert.equal((await request('/api/worker/metrics', ALICE)).status, 403)
    })

    test('are refused to a user who is not an admin however the path is cased', async () => {
        assert.equal((await request('/api/worker/METRICS', ADMIN)).body, METRICS)

        assert.equal((await request('/api/worker/METRICS', ALICE)).status, 403)
    })

    test('are refused without credentials', async () => {
        assert.equal((await request('/api/gee/metrics')).status, 401)
    })
})

describe('a module\'s other routes', () => {
    test('stay open to a user who is not an admin', async () => {
        const {status, body} = await request('/api/gee/echo', ALICE)

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
    restrictMetricsToAdmins(app, authMiddleware)
    Proxy(userStore, authMiddleware, googleAccessTokenMiddleware).proxyEndpoints(app)
    const server = await listen(app)
    gatewayUrl = `http://127.0.0.1:${server.address().port}`
    return {close: () => new Promise(resolve => server.close(resolve))}
}

const request = async (path, user) => {
    const response = await fetch(`${gatewayUrl}${path}`, {
        headers: {
            ...(user
                ? {'Authorization': `Basic ${Buffer.from(`${user.username}:${PASSWORD}`).toString('base64')}`}
                : {}),
            'No-auth-challenge': 'true'
        }
    })
    return {status: response.status, body: await response.text()}
}

async function startUpstream() {
    const usersByName = {admin: ADMIN, alice: ALICE}

    const app = express()
    app.set('case sensitive routing', true)
    app.use(express.urlencoded({extended: false}))
    app.post('/authenticate', (req, res) => {
        const {username, password} = req.body
        usersByName[username] && password === PASSWORD
            ? res.json(usersByName[username])
            : res.status(401).json({})
    })
    app.get(['/metrics', '/metrics.json'], (_req, res) => res.send(METRICS))
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
