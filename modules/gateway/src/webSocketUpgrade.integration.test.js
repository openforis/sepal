import assert from 'node:assert/strict'
import {once} from 'node:events'
import {createServer} from 'node:http'
import {after, before, describe, mock, test} from 'node:test'

import express from 'express'
import {of, Subject} from 'rxjs'
import {WebSocket, WebSocketServer} from 'ws'

import {LOGIN_SESSION_INVALIDATED} from '#sepal/event/definitions'

// Websocket upgrades bypass Express, so the gateway guards them separately: over real HTTP, through the
// real proxy and endpoint configuration, to a stand-in module that accepts every upgrade it is sent.

const ALICE = {id: 2, username: 'alice', roles: [], status: 'ACTIVE'}
const BOB = {id: 3, username: 'bob', roles: [], status: 'ACTIVE'}
const event$ = new Subject()

const upstream = await startUpstream()

mock.module('../config/modules.json', {
    exports: {
        default: {gee: upstream.address, terminal: upstream.address, userFiles: upstream.address}
    }
})

// The real configuration parses process arguments at import and exits the process when a mandatory
// one is missing, which under a test runner they all are.
mock.module('./config.js', {
    exports: {
        sepalHost: 'sepal.test'
    }
})

const {Proxy} = await import('./proxy.js')
const {webSocketUpgradeHandler} = await import('./webSocketUpgrade.js')
const {createSandboxProxy} = await import('./sandbox/sandboxProxy.js')

describe('a websocket upgrade', () => {
    for (const reason of ['logout', 'locked', 'invalidated']) {
        test(`${reason} closes terminal and sandbox sockets for only that login`, {timeout: 5000}, async t => {
            const sockets = []
            t.after(() => sockets.forEach(socket => socket.terminate()))
            for (const options of [
                {path: '/api/terminal/revoked', user: ALICE, sessionId: 'revoked'},
                {path: '/api/sandbox/rstudio/ws', user: ALICE, sessionId: 'revoked'},
                {path: '/api/terminal/kept', user: ALICE, sessionId: 'kept'},
                {path: '/api/sandbox/jupyter/channels', user: BOB, sessionId: 'bob'}
            ]) {
                sockets.push(await openWebSocket(options))
            }
            const revoked = sockets.slice(0, 2)
            const upstreamClosed = [...upstream.clients]
                .filter(socket => socket.loginSessionId === 'revoked')
                .map(socket => once(socket, 'close'))
            const outcomes = revoked.map(socket => new Promise(resolve => {
                socket.once('close', () => resolve('closed'))
                socket.once('message', () => resolve('still usable'))
            }))

            event$.next({type: LOGIN_SESSION_INVALIDATED, data: {username: ALICE.username, sessionId: 'revoked', reason}})
            revoked.forEach(socket => socket.send('after invalidation'))

            assert.deepEqual(await Promise.all(outcomes), ['closed', 'closed'])
            await Promise.all(upstreamClosed)
            for (const socket of sockets.slice(2)) {
                const echoed = once(socket, 'message')
                socket.send('still working')
                assert.equal((await echoed)[0].toString(), 'still working')
            }
        })
    }

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

    test('refuses direct user-files upgrades without reaching the internal protocol', async () => {
        const upgrades = upstream.upgrades
        for (const path of ['/api/user-files', '/api/user-files/', '/api/user-files/ws?user=bob']) {
            const {status} = await upgrade(path, ALICE, {
                'sepal-user': JSON.stringify({username: 'bob', admin: true})
            })
            assert.equal(status, 404, path)
        }
        assert.equal(upstream.upgrades, upgrades)
    })

    test('still accepts the global browser websocket', async () => {
        assert.equal((await upgrade('/api/ws', ALICE)).status, 101)
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
    const wss = new WebSocketServer({noServer: true})
    server.on('upgrade', webSocketUpgradeHandler({
        event$,
        sessionParser: fakeSessionParser,
        userStore: {getUser$: username => of({alice: ALICE, bob: BOB}[username])},
        wss,
        sandboxProxy: createSandboxProxy({
            resolveTarget: async () => ({host: '127.0.0.1', port: upstream.port, sessionId: 'worker-session'}),
            ensureServerStarted: async () => {},
            forgetServerStarted: () => {},
            sepalHost: 'sepal.test'
        }),
        proxies
    }))
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    gatewayUrl = `ws://127.0.0.1:${server.address().port}`
    return {close: () => new Promise(resolve => {
        wss.clients.forEach(client => client.terminate())
        wss.close()
        server.close(resolve)
    })}
}

// Stands in for the cookie session: the test names the logged-in user directly.
const LOGIN_HEADER = 'test-login'

const fakeSessionParser = (req, _res, next) => {
    req.session = {username: req.headers[LOGIN_HEADER]}
    req.sessionID = req.headers['test-session'] || 'default-login'
    next()
}

const openWebSocket = async ({path, user, sessionId}) => {
    const socket = new WebSocket(`${gatewayUrl}${path}`, {
        headers: {[LOGIN_HEADER]: user.username, 'test-session': sessionId}
    })
    await once(socket, 'open')
    return socket
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
    const upstream = {lastUpgradeHeaders: null, upgrades: 0, clients: wss.clients}
    server.on('upgrade', (req, socket, head) => {
        upstream.upgrades++
        upstream.lastUpgradeHeaders = req.headers
        wss.handleUpgrade(req, socket, head, ws => {
            ws.loginSessionId = req.headers['test-session']
            ws.on('message', data => ws.send(data))
        })
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    upstream.address = `127.0.0.1:${server.address().port}`
    upstream.port = server.address().port
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
