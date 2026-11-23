import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {before, describe, mock, test} from 'node:test'

import {of, Subject} from 'rxjs'

import {LOGIN_SESSION_INVALIDATED} from '#sepal/event/definitions'
import {configureNoLogging} from '#sepal/log'

import {webSocketUpgradeHandler} from './webSocketUpgrade.js'

before(() => configureNoLogging())

describe('login invalidation during websocket setup', () => {
    test('stops an upgrade while the session store is still loading', async t => {
        let parsed
        const {upgrade, req, socket, invalidate, proxy} = aGateway({
            t, sessionParser: (_req, _res, next) => { parsed = next }
        })

        upgrade(req, socket, Buffer.alloc(0))
        invalidate()
        parsed()
        await new Promise(resolve => setImmediate(resolve))

        assert.equal(socket.destroyed, true)
        assert.equal(proxy.upgrade.mock.callCount(), 0)
    })

    for (const outcome of ['user loaded', 'lookup failed']) {
        test(`stops an upgrade during user lookup when ${outcome}`, async t => {
            const user$ = new Subject()
            const {upgrade, req, socket, invalidate, proxy} = aGateway({t, user$})

            upgrade(req, socket, Buffer.alloc(0))
            invalidate()
            if (outcome === 'user loaded') user$.next({username: 'alice', status: 'ACTIVE'})
            else user$.error(new Error('lookup failed'))
            await new Promise(resolve => setImmediate(resolve))

            assert.equal(socket.destroyed, true)
            assert.equal(proxy.upgrade.mock.callCount(), 0)
            assert.equal(socket.write.mock.callCount(), 0)
        })
    }

    test('releases its invalidation listener after the socket closes', async t => {
        const {upgrade, req, socket, invalidate} = aGateway({t})
        upgrade(req, socket, Buffer.alloc(0))
        await new Promise(resolve => setImmediate(resolve))

        socket.emit('close')
        invalidate()

        assert.equal(socket.destroy.mock.callCount(), 0)
    })

    test('leaves established global browser sockets to their existing notification-and-close path', t => {
        const {upgrade, req, socket, invalidate, wss} = aGateway({t, path: '/api/ws'})

        upgrade(req, socket, Buffer.alloc(0))
        invalidate()

        assert.equal(wss.handleUpgrade.mock.callCount(), 1)
        assert.equal(socket.destroy.mock.callCount(), 0)
    })
})

const aGateway = ({t, sessionParser = (_req, _res, next) => next(), user$ = of({username: 'alice', status: 'ACTIVE'}), path = '/api/terminal/session'} = {}) => {
    const event$ = new Subject()
    const socket = new EventEmitter()
    socket.destroyed = false
    socket.write = mock.fn()
    socket.destroy = mock.fn(() => {
        socket.destroyed = true
        socket.emit('close')
    })
    t.after(() => {
        socket.emit('close')
        event$.complete()
    })
    const req = {url: path, sessionID: 'login', session: {username: 'alice'}, headers: {}}
    const proxy = {upgrade: mock.fn()}
    const wss = {handleUpgrade: mock.fn()}
    const upgrade = webSocketUpgradeHandler({
        event$, sessionParser, userStore: {getUser$: () => user$}, wss,
        sandboxProxy: {matches: () => false},
        proxies: [{path: '/api/terminal', ws: true, proxy}]
    })
    const invalidate = () => event$.next({
        type: LOGIN_SESSION_INVALIDATED, data: {username: 'alice', sessionId: 'login', reason: 'logout'}
    })
    return {upgrade, req, socket, invalidate, proxy, wss}
}
