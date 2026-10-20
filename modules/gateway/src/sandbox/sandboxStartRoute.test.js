import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {sandboxStartRoute} from './sandboxStartRoute.js'

const mockRes = () => {
    const res = {statusCode: 200, body: undefined}
    res.status = mock.fn(code => {
        res.statusCode = code
        return res
    })
    res.json = mock.fn(body => {
        res.body = body
        return res
    })
    res.end = mock.fn(() => res)
    return res
}

const reqWithUser = (method, {endpoint, username = 'alice', ...query} = {}) => ({
    method,
    query: {...(endpoint ? {endpoint} : {}), ...query},
    headers: username ? {'sepal-user': JSON.stringify({username, roles: []})} : {}
})

describe('sandboxStartRoute', () => {
    test('POST → startApp → {id, status: STARTED}', async () => {
        const mgr = {startApp: mock.fn(async () => ({
            id: 's1',
            status: 'STARTED'
        }))}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'rstudio'}), res)
        assert.deepEqual(callsOf(mgr.startApp), [[
            {username: 'alice', endpoint: 'rstudio', appPath: undefined, appLabel: undefined, sessionId: undefined, instanceType: undefined, reassert: false, clientId: undefined}
        ]])
        assert.deepEqual(res.body, {id: 's1', status: 'STARTED'})
    })

    test('GET → status → {id, status: STARTING}', async () => {
        const mgr = {status: mock.fn(async () => ({
            id: 's1',
            status: 'STARTING'
        }))}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('GET', {endpoint: 'shiny'}), res)
        assert.deepEqual(callsOf(mgr.status), [['alice', 'shiny', undefined]])
        assert.deepEqual(res.body, {id: 's1', status: 'STARTING'})
    })

    test('endpoint defaults to shiny when absent', async () => {
        const mgr = {startApp: mock.fn(async () => ({
            id: 's1',
            status: 'STARTING'
        }))}
        const {handler} = sandboxStartRoute(mgr)
        await handler(reqWithUser('POST', {endpoint: undefined}), mockRes())
        assert.deepEqual(callsOf(mgr.startApp), [[
            {username: 'alice', endpoint: 'shiny', appPath: undefined, appLabel: undefined, sessionId: undefined, instanceType: undefined, reassert: false, clientId: undefined}
        ]])
    })

    test('GET with no started session → 400', async () => {
        const mgr = {status: mock.fn(async () => null)}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('GET', {endpoint: 'rstudio'}), res)
        assert.equal(res.statusCode, 400)
    })

    test('missing sepal-user → 400', async () => {
        const mgr = {startApp: mock.fn()}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'rstudio', username: null}), res)
        assert.equal(res.statusCode, 400)
        assert.equal(mgr.startApp.mock.callCount(), 0)
    })

    test('startApp failure → 500', async () => {
        const mgr = {startApp: mock.fn(async () => {
            throw new Error('boom')
        })}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'rstudio'}), res)
        assert.equal(res.statusCode, 500)
    })

    test('a launch AWS refused keeps the worker\'s 503 and code', async () => {
        const error = Object.assign(new Error('worker POST → 503'), {statusCode: 503, body: {code: 'INSTANCE_UNAVAILABLE', message: 'Insufficient capacity.'}})
        const mgr = {startApp: mock.fn(async () => {
            throw error
        })}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'rstudio'}), res)
        assert.equal(res.statusCode, 503)
        assert.deepEqual(
            res.body,
            {error: 'Failed to start sandbox session', code: 'INSTANCE_UNAVAILABLE'}
        )
    })

    test('an unclassified worker 503 stays a plain 500', async () => {
        const error = Object.assign(new Error('worker POST → 503'), {statusCode: 503, body: null})
        const mgr = {startApp: mock.fn(async () => {
            throw error
        })}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'rstudio'}), res)
        assert.equal(res.statusCode, 500)
        assert.deepEqual(res.body, {error: 'Failed to start sandbox session'})
    })

    test('POST forwards appPath/appLabel/sessionId/instanceType to startApp', async () => {
        const mgr = {startApp: mock.fn(async () => ({
            id: 's-1',
            status: 'STARTING'
        }))}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', instanceType: 'M6aXlarge'}), res)
        assert.deepEqual(callsOf(mgr.startApp), [[
            {username: 'alice', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', sessionId: undefined, instanceType: 'M6aXlarge', reassert: false, clientId: undefined}
        ]])
        assert.deepEqual(res.body, {id: 's-1', status: 'STARTING'})
    })

    test('GET polls status with appPath', async () => {
        const mgr = {status: mock.fn(async () => ({
            id: 's-1',
            status: 'STARTED'
        }))}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('GET', {endpoint: 'shiny', appPath: '/sandbox/shiny/foo'}), res)
        assert.deepEqual(callsOf(mgr.status), [['alice', 'shiny', '/sandbox/shiny/foo']])
    })

    test('propagates a worker 4xx from startApp', async () => {
        const error = new Error('nope')
        error.statusCode = 404
        const mgr = {startApp: mock.fn(async () => {
            throw error
        })}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'shiny', appPath: '/x', sessionId: 'ghost'}), res)
        assert.equal(res.statusCode, 404)
    })

    test('DELETE → releaseApp → 204 (tab close unbinds the app)', async () => {
        const mgr = {releaseApp: mock.fn(async () => undefined)}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('DELETE', {appPath: '/sandbox/shiny/foo'}), res)
        assert.deepEqual(
            callsOf(mgr.releaseApp),
            [[{username: 'alice', appPath: '/sandbox/shiny/foo', clientId: undefined}]]
        )
        assert.equal(res.statusCode, 204)
        assert.ok(res.end.mock.callCount() > 0)
    })

    test('DELETE without appPath → 400', async () => {
        const mgr = {releaseApp: mock.fn()}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('DELETE', {}), res)
        assert.equal(res.statusCode, 400)
        assert.equal(mgr.releaseApp.mock.callCount(), 0)
    })

    test('POST forwards clientId to startApp (app ↔ client ownership)', async () => {
        const mgr = {startApp: mock.fn(async () => ({
            id: 's-1',
            status: 'STARTING'
        }))}
        const {handler} = sandboxStartRoute(mgr)
        await handler(reqWithUser('POST', {endpoint: 'shiny', appPath: '/sandbox/shiny/foo', clientId: 'c-1'}), mockRes())
        assert.partialDeepStrictEqual(callsOf(mgr.startApp), [[{clientId: 'c-1'}]])
    })

    test('POST forwards the reconnect re-assert flag to startApp', async () => {
        const mgr = {startApp: mock.fn(async () => ({
            id: 's-1',
            status: 'STARTING'
        }))}
        const {handler} = sandboxStartRoute(mgr)
        await handler(reqWithUser('POST', {appPath: '/sandbox/shiny/foo', sessionId: 's-1', reassert: 'true'}), mockRes())
        assert.partialDeepStrictEqual(callsOf(mgr.startApp), [[{reassert: true}]])
    })

    // Anything but the literal string is a real open: a garbled report must err toward keeping the
    // session alive rather than silently dropping every open ratchet.
    test('POST treats a non-"true" reassert as a real open', async () => {
        const mgr = {startApp: mock.fn(async () => ({
            id: 's-1',
            status: 'STARTING'
        }))}
        const {handler} = sandboxStartRoute(mgr)
        await handler(reqWithUser('POST', {appPath: '/sandbox/shiny/foo', reassert: '1'}), mockRes())
        assert.partialDeepStrictEqual(callsOf(mgr.startApp), [[{reassert: false}]])
    })

    test('DELETE forwards the requesting clientId to releaseApp', async () => {
        const mgr = {releaseApp: mock.fn(async () => undefined)}
        const {handler} = sandboxStartRoute(mgr)
        await handler(reqWithUser('DELETE', {appPath: '/sandbox/shiny/foo', clientId: 'c-1'}), mockRes())
        assert.deepEqual(
            callsOf(mgr.releaseApp),
            [[{username: 'alice', appPath: '/sandbox/shiny/foo', clientId: 'c-1'}]]
        )
    })

    test('DELETE releaseApp failure → 500', async () => {
        const mgr = {releaseApp: mock.fn(async () => {
            throw new Error('boom')
        })}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('DELETE', {appPath: '/sandbox/shiny/foo'}), res)
        assert.equal(res.statusCode, 500)
    })
})
