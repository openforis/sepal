import {jest} from '@jest/globals'

import {sandboxStartRoute} from './sandboxStartRoute.js'

const mockRes = () => {
    const res = {statusCode: 200, body: undefined}
    res.status = jest.fn(code => {
        res.statusCode = code
        return res
    })
    res.json = jest.fn(body => {
        res.body = body
        return res
    })
    res.end = jest.fn(() => res)
    return res
}

const reqWithUser = (method, {endpoint, username = 'alice', ...query} = {}) => ({
    method,
    query: {...(endpoint ? {endpoint} : {}), ...query},
    headers: username ? {'sepal-user': JSON.stringify({username, roles: []})} : {}
})

describe('sandboxStartRoute', () => {
    test('POST → startApp → {id, status: STARTED}', async () => {
        const mgr = {startApp: jest.fn().mockResolvedValue({id: 's1', status: 'STARTED'})}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'rstudio'}), res)
        expect(mgr.startApp).toHaveBeenCalledWith({username: 'alice', endpoint: 'rstudio', appPath: undefined, appLabel: undefined, sessionId: undefined, instanceType: undefined, reassert: false})
        expect(res.body).toEqual({id: 's1', status: 'STARTED'})
    })

    test('GET → status → {id, status: STARTING}', async () => {
        const mgr = {status: jest.fn().mockResolvedValue({id: 's1', status: 'STARTING'})}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('GET', {endpoint: 'shiny'}), res)
        expect(mgr.status).toHaveBeenCalledWith('alice', 'shiny', undefined)
        expect(res.body).toEqual({id: 's1', status: 'STARTING'})
    })

    test('endpoint defaults to shiny when absent', async () => {
        const mgr = {startApp: jest.fn().mockResolvedValue({id: 's1', status: 'STARTING'})}
        const {handler} = sandboxStartRoute(mgr)
        await handler(reqWithUser('POST', {endpoint: undefined}), mockRes())
        expect(mgr.startApp).toHaveBeenCalledWith({username: 'alice', endpoint: 'shiny', appPath: undefined, appLabel: undefined, sessionId: undefined, instanceType: undefined, reassert: false})
    })

    test('GET with no started session → 400', async () => {
        const mgr = {status: jest.fn().mockResolvedValue(null)}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('GET', {endpoint: 'rstudio'}), res)
        expect(res.statusCode).toBe(400)
    })

    test('missing sepal-user → 400', async () => {
        const mgr = {startApp: jest.fn()}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'rstudio', username: null}), res)
        expect(res.statusCode).toBe(400)
        expect(mgr.startApp).not.toHaveBeenCalled()
    })

    test('startApp failure → 500', async () => {
        const mgr = {startApp: jest.fn().mockRejectedValue(new Error('boom'))}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'rstudio'}), res)
        expect(res.statusCode).toBe(500)
    })

    test('POST forwards appPath/appLabel/sessionId/instanceType to startApp', async () => {
        const mgr = {startApp: jest.fn().mockResolvedValue({id: 's-1', status: 'STARTING'})}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', instanceType: 'M6aXlarge'}), res)
        expect(mgr.startApp).toHaveBeenCalledWith({username: 'alice', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', sessionId: undefined, instanceType: 'M6aXlarge', reassert: false})
        expect(res.body).toEqual({id: 's-1', status: 'STARTING'})
    })

    test('GET polls status with appPath', async () => {
        const mgr = {status: jest.fn().mockResolvedValue({id: 's-1', status: 'STARTED'})}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('GET', {endpoint: 'shiny', appPath: '/sandbox/shiny/foo'}), res)
        expect(mgr.status).toHaveBeenCalledWith('alice', 'shiny', '/sandbox/shiny/foo')
    })

    test('propagates a worker 4xx from startApp', async () => {
        const error = new Error('nope')
        error.statusCode = 404
        const mgr = {startApp: jest.fn().mockRejectedValue(error)}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('POST', {endpoint: 'shiny', appPath: '/x', sessionId: 'ghost'}), res)
        expect(res.statusCode).toBe(404)
    })

    test('DELETE → releaseApp → 204 (tab close unbinds the app)', async () => {
        const mgr = {releaseApp: jest.fn().mockResolvedValue(undefined)}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('DELETE', {appPath: '/sandbox/shiny/foo'}), res)
        expect(mgr.releaseApp).toHaveBeenCalledWith({username: 'alice', appPath: '/sandbox/shiny/foo'})
        expect(res.statusCode).toBe(204)
        expect(res.end).toHaveBeenCalled()
    })

    test('DELETE without appPath → 400', async () => {
        const mgr = {releaseApp: jest.fn()}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('DELETE', {}), res)
        expect(res.statusCode).toBe(400)
        expect(mgr.releaseApp).not.toHaveBeenCalled()
    })

    test('POST forwards clientId to startApp (app ↔ client ownership)', async () => {
        const mgr = {startApp: jest.fn().mockResolvedValue({id: 's-1', status: 'STARTING'})}
        const {handler} = sandboxStartRoute(mgr)
        await handler(reqWithUser('POST', {endpoint: 'shiny', appPath: '/sandbox/shiny/foo', clientId: 'c-1'}), mockRes())
        expect(mgr.startApp).toHaveBeenCalledWith(expect.objectContaining({clientId: 'c-1'}))
    })

    test('POST forwards the reconnect re-assert flag to startApp', async () => {
        const mgr = {startApp: jest.fn().mockResolvedValue({id: 's-1', status: 'STARTING'})}
        const {handler} = sandboxStartRoute(mgr)
        await handler(reqWithUser('POST', {appPath: '/sandbox/shiny/foo', sessionId: 's-1', reassert: 'true'}), mockRes())
        expect(mgr.startApp).toHaveBeenCalledWith(expect.objectContaining({reassert: true}))
    })

    // Anything but the literal string is a real open: a garbled report must err toward keeping the
    // session alive rather than silently dropping every open ratchet.
    test('POST treats a non-"true" reassert as a real open', async () => {
        const mgr = {startApp: jest.fn().mockResolvedValue({id: 's-1', status: 'STARTING'})}
        const {handler} = sandboxStartRoute(mgr)
        await handler(reqWithUser('POST', {appPath: '/sandbox/shiny/foo', reassert: '1'}), mockRes())
        expect(mgr.startApp).toHaveBeenCalledWith(expect.objectContaining({reassert: false}))
    })

    test('DELETE forwards the requesting clientId to releaseApp', async () => {
        const mgr = {releaseApp: jest.fn().mockResolvedValue(undefined)}
        const {handler} = sandboxStartRoute(mgr)
        await handler(reqWithUser('DELETE', {appPath: '/sandbox/shiny/foo', clientId: 'c-1'}), mockRes())
        expect(mgr.releaseApp).toHaveBeenCalledWith({username: 'alice', appPath: '/sandbox/shiny/foo', clientId: 'c-1'})
    })

    test('DELETE releaseApp failure → 500', async () => {
        const mgr = {releaseApp: jest.fn().mockRejectedValue(new Error('boom'))}
        const {handler} = sandboxStartRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser('DELETE', {appPath: '/sandbox/shiny/foo'}), res)
        expect(res.statusCode).toBe(500)
    })
})
