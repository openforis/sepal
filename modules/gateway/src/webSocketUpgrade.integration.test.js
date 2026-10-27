import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {after, before, describe, mock, test} from 'node:test'

import express from 'express'
import {of} from 'rxjs'
import {WebSocket, WebSocketServer} from 'ws'

// Websocket upgrades bypass Express, so the gateway guards them separately: over real HTTP, through the
// real proxy and endpoint configuration, to a stand-in module that accepts every upgrade it is sent.

const ALICE = {id: 2, username: 'alice', roles: [], status: 'ACTIVE'}

const upstream = await startUpstream()

mock.module('../config/modules.json', {
    exports: {
        default: {gee: upstream.address, terminal: upstream.address}
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

const {Proxy} = await import('./proxy.js')
const {webSocketUpgradeHandler} = await import('./webSocketUpgrade.js')

describe('a websocket upgrade', () => {
    test('reaches a websocket endpoint as the logged-in user', async () => {
        const {status, headers} = await upgrade('/api/terminal/session-1', ALICE)

        assert.equal(status, 101)
        assert.equal(JSON.parse(headers['sepal-user']).username, ALICE.username)
    })

    test('does not forward a worker session sent by the client', async () => {
        const {status, headers} = await upgrade('/api/terminal/session-1', ALICE, {
            'sepal-session': JSON.stringify({sessionId: 'session-of-another', workerType: 'task'})
        })

        assert.equal(status, 101)
        assert.equal(headers['sepal-session'], undefined)
    })

    test('is refused on an endpoint not marked for websockets', async () => {
        assert.equal((await upgrade('/api/gee/projects', ALICE)).status, 404)
    })

    test('is refused on a module\'s metrics', async () => {
        assert.equal((await upgrade('/api/terminal/metrics', ALICE)).status, 403)
    })

    test('is refused without a login', async () => {
        assert.equal((await upgrade('/api/terminal/session-1')).status, 401)
    })
})

let gatewayUrl

const startGateway = async () => {
    const passThrough = (_req, _res, next) => next()
    const proxies = Proxy({}, passThrough, passThrough).proxyEndpoints(express())
    const server = createServer()
    server.on('upgrade', webSocketUpgradeHandler({
        sessionParser: fakeSessionParser,
        userStore: {getUser$: username => of({alice: ALICE}[username])},
        wss: null,
        sandboxProxy: {matches: () => false},
        proxies
    }))
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    gatewayUrl = `ws://127.0.0.1:${server.address().port}`
    return {close: () => new Promise(resolve => server.close(resolve))}
}

// Stands in for the cookie session: the test names the logged-in user directly.
const LOGIN_HEADER = 'test-login'

const fakeSessionParser = (req, _res, next) => {
    req.session = {username: req.headers[LOGIN_HEADER]}
    next()
}

const upgrade = (path, user, headers = {}) =>
    new Promise((resolve, reject) => {
        const ws = new WebSocket(`${gatewayUrl}${path}`, {
            headers: {...headers, ...(user ? {[LOGIN_HEADER]: user.username} : {})}
        })
        ws.on('open', () => {
            ws.close()
            resolve({status: 101, headers: upstream.lastUpgradeHeaders})
        })
        ws.on('unexpected-response', (_req, res) => {
            res.resume()
            resolve({status: res.statusCode})
        })
        ws.on('error', reject)
    })

async function startUpstream() {
    const wss = new WebSocketServer({noServer: true})
    const server = createServer()
    const upstream = {lastUpgradeHeaders: null}
    server.on('upgrade', (req, socket, head) => {
        upstream.lastUpgradeHeaders = req.headers
        wss.handleUpgrade(req, socket, head, () => {})
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    upstream.address = `127.0.0.1:${server.address().port}`
    upstream.close = () => new Promise(resolve => {
        wss.clients.forEach(client => client.terminate())
        server.close(resolve)
    })
    return upstream
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
