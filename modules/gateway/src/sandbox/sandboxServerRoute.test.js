import {jest} from '@jest/globals'

import {sandboxServerRoute} from './sandboxServerRoute.js'

describe('sandboxServerRoute', () => {
    test('POST → ensureServerStarted → 204 once the server is listening', async () => {
        const mgr = {ensureServerStarted: jest.fn().mockResolvedValue(undefined)}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({sessionId: 's1', endpoint: 'jupyter'}), res)
        expect(mgr.ensureServerStarted).toHaveBeenCalledWith({username: 'alice', sessionId: 's1', endpoint: 'jupyter'})
        expect(res.statusCode).toBe(204)
    })

    test('a worker refusal is passed through with its status', async () => {
        const error = Object.assign(new Error('Session not active'), {statusCode: 409})
        const mgr = {ensureServerStarted: jest.fn().mockRejectedValue(error)}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({sessionId: 's1', endpoint: 'jupyter'}), res)
        expect(res.statusCode).toBe(409)
    })

    test('a server that fails to start → 502', async () => {
        const mgr = {ensureServerStarted: jest.fn().mockRejectedValue(new Error('exit code 1'))}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({sessionId: 's1', endpoint: 'jupyter'}), res)
        expect(res.statusCode).toBe(502)
    })

    test('missing sessionId → 400', async () => {
        const mgr = {ensureServerStarted: jest.fn()}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({endpoint: 'jupyter'}), res)
        expect(res.statusCode).toBe(400)
        expect(mgr.ensureServerStarted).not.toHaveBeenCalled()
    })

    test('unknown endpoint → 400', async () => {
        const mgr = {ensureServerStarted: jest.fn()}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({sessionId: 's1', endpoint: 'vscode'}), res)
        expect(res.statusCode).toBe(400)
        expect(mgr.ensureServerStarted).not.toHaveBeenCalled()
    })

    test('missing sepal-user → 400', async () => {
        const mgr = {ensureServerStarted: jest.fn()}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({sessionId: 's1', endpoint: 'jupyter', username: null}), res)
        expect(res.statusCode).toBe(400)
        expect(mgr.ensureServerStarted).not.toHaveBeenCalled()
    })
})

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

const reqWithUser = ({username = 'alice', ...query} = {}) => ({
    method: 'POST',
    query,
    headers: username ? {'sepal-user': JSON.stringify({username, roles: []})} : {}
})
