import assert from 'node:assert/strict'
import {once} from 'node:events'
import {createServer, get} from 'node:http'
import {createRequire} from 'node:module'
import {after, afterEach, before, beforeEach, mock, test} from 'node:test'
import {setImmediate as settled} from 'node:timers/promises'

import express from 'express'
import {of, Subject} from 'rxjs'
import {WebSocket, WebSocketServer} from 'ws'

import {LOGIN_SESSION_INVALIDATED} from '#sepal/event/definitions'
import {configureNoLogging} from '#sepal/log'

// Shared logging has its own dependency installation; capture that instance.
const log4js = createRequire(import.meta.resolve('#sepal/log'))('log4js')
const upstream = await startUpstream()
mock.module('../config/modules.json', {exports: {default: {terminal: upstream.address}}})
mock.module('./config.js', {exports: {sepalHost: 'sepal.test'}})
const {Proxy} = await import('./proxy.js')
const {createSandboxProxy} = await import('./sandbox/sandboxProxy.js')
const {webSocketUpgradeHandler} = await import('./webSocketUpgrade.js')

const USER = {username: 'alice', status: 'ACTIVE', roles: []}
const event$ = new Subject()
const logs = []
let arrived
let gateway

for (const [name, path] of [['module', '/api/terminal/pending'], ['sandbox', '/api/sandbox/rstudio/pending']]) {
    test(`${name}: revocation during a WebSocket handshake stays out of ERROR logs`, {timeout: 5000}, async t => {
        const client = websocket(t, path)
        const pending = await arrived.promise
        const upstreamClosed = once(pending.socket, 'close')
        const clientClosed = closed(client)

        event$.next({type: LOGIN_SESSION_INVALIDATED, data: {sessionId: 'login'}})
        await Promise.all([upstreamClosed, clientClosed])
        await settled()

        assert.equal(errors().length, 0)
        assert.ok(logs.some(event => event.level.levelStr === 'DEBUG' && hasCode(event, 'ECONNRESET')))
    })

    test(`${name}: an abandoned HTTP request stays out of ERROR logs`, {timeout: 5000}, async t => {
        const client = get(`${gateway.url}${path}`)
        client.on('error', () => {})
        t.after(() => client.destroy())
        const pending = await arrived.promise
        const upstreamClosed = once(pending.socket, 'close')
        const clientClosed = closed(client)

        client.destroy()
        await Promise.all([upstreamClosed, clientClosed])
        await settled()

        assert.equal(errors().length, 0)
    })

    test(`${name}: an upstream WebSocket reset remains an ERROR`, {timeout: 5000}, async t => {
        const client = websocket(t, path)
        const pending = await arrived.promise
        const clientClosed = closed(client)

        pending.socket.destroy()
        await clientClosed
        await settled()

        assert.ok(errors().some(event => hasCode(event, 'ECONNRESET')))
    })

    test(`${name}: a truncated rejected WebSocket response remains an ERROR`, {timeout: 5000}, async t => {
        const client = websocket(t, path)
        const rejected = once(client, 'unexpected-response')
        const pending = await arrived.promise
        pending.socket.write('HTTP/1.1 403 Forbidden\r\nContent-Length: 100\r\n\r\npartial')
        const [_request, body] = await rejected
        const failedBody = once(body, 'error')
        body.resume()

        pending.socket.destroy()
        await failedBody
        client.terminate()
        await settled()

        assert.ok(errors().some(event => hasCode(event, 'ECONNRESET')))
    })

    test(`${name}: a truncated upstream HTTP response remains an ERROR`, {timeout: 5000}, async t => {
        const client = get(`${gateway.url}${path}`)
        client.on('error', () => {})
        t.after(() => client.destroy())
        const response = once(client, 'response')
        const pending = await arrived.promise
        pending.response.writeHead(200, {'Content-Length': '100'})
        pending.response.write('partial')
        const [body] = await response
        const failedBody = once(body, 'error')
        body.resume()

        pending.socket.destroy()
        await failedBody
        await settled()

        assert.ok(errors().some(event => hasCode(event, 'ECONNRESET')))
    })
}

for (const [name, path] of [['module', '/api/terminal/pending'], ['sandbox', '/api/sandbox/rstudio/pending']]) {
    test(`${name}: a refused upstream connection remains an ERROR`, {timeout: 5000}, async t => {
        await upstream.close()
        const client = websocket(t, path)

        await closed(client)
        await settled()

        assert.ok(errors().some(event => hasCode(event, 'ECONNREFUSED')))
    })
}

const errors = () => logs.filter(event => ['ERROR', 'FATAL'].includes(event.level.levelStr))
const hasCode = (event, code) => event.data.some(value => value?.code === code || value === code)
const closed = stream => new Promise(resolve => stream.once('close', resolve))

const websocket = (t, path) => {
    const client = new WebSocket(`${gateway.url.replace('http:', 'ws:')}${path}`)
    client.on('error', () => {})
    t.after(() => client.terminate())
    return client
}

async function startUpstream() {
    const server = createServer((request, response) => arrived.resolve({request, response, socket: request.socket}))
    server.on('upgrade', (request, socket) => {
        socket.on('end', () => socket.end())
        arrived.resolve({request, socket})
    })
    return listen(server)
}

async function startGateway() {
    const app = express()
    app.use((req, _res, next) => {
        req.headers['sepal-user'] = JSON.stringify(USER)
        next()
    })
    const sandboxProxy = createSandboxProxy({
        resolveTarget: async () => ({host: '127.0.0.1', port: upstream.port, sessionId: 'worker'}),
        ensureServerStarted: async () => {},
        forgetServerStarted: () => {},
        sepalHost: 'sepal.test'
    })
    app.use('/api/sandbox', sandboxProxy.middleware)
    const pass = (_req, _res, next) => next()
    const proxies = Proxy({}, pass, pass).proxyEndpoints(app)
    const server = createServer(app)
    const wss = new WebSocketServer({noServer: true})
    server.on('upgrade', webSocketUpgradeHandler({
        sessionParser: (req, _res, next) => {
            req.sessionID = 'login'
            req.session = {username: USER.username}
            next()
        },
        userStore: {getUser$: () => of(USER)},
        wss, sandboxProxy, proxies, event$
    }))
    const running = await listen(server)
    return {
        ...running,
        close: async () => {
            wss.close()
            await running.close()
        }
    }
}

async function listen(server) {
    const connections = new Set()
    server.on('connection', socket => {
        connections.add(socket)
        socket.once('close', () => connections.delete(socket))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const {port} = server.address()
    return {
        port, address: `127.0.0.1:${port}`, url: `http://127.0.0.1:${port}`,
        close: async () => {
            connections.forEach(socket => socket.destroy())
            if (server.listening) {
                await new Promise(resolve => server.close(resolve))
            }
        }
    }
}

before(async () => { gateway = await startGateway() })
beforeEach(() => {
    arrived = Promise.withResolvers()
    logs.length = 0
    log4js.configure({
        appenders: {capture: {type: {configure: () => event => logs.push(event)}}},
        categories: {default: {appenders: ['capture'], level: 'debug'}}
    })
})
afterEach(() => configureNoLogging())
after(async () => {
    await gateway?.close()
    await upstream.close()
})
