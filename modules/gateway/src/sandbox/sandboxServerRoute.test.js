import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {sandboxServerRoute} from './sandboxServerRoute.js'

describe('sandboxServerRoute', () => {
    test('POST → ensureServerStarted → 204 once the server is listening', async () => {
        const mgr = {ensureServerStarted: mock.fn(async () => undefined)}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({sessionId: 's1', endpoint: 'jupyter'}), res)
        assert.deepEqual(
            callsOf(mgr.ensureServerStarted),
            [[{username: 'alice', sessionId: 's1', endpoint: 'jupyter'}]]
        )
        assert.equal(res.statusCode, 204)
    })

    test('a worker refusal is passed through with its status', async () => {
        const error = Object.assign(new Error('Session not active'), {statusCode: 409})
        const mgr = {ensureServerStarted: mock.fn(async () => {
            throw error
        })}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({sessionId: 's1', endpoint: 'jupyter'}), res)
        assert.equal(res.statusCode, 409)
    })

    test('a server that fails to start → 502', async () => {
        const mgr = {ensureServerStarted: mock.fn(async () => {
            throw new Error('exit code 1')
        })}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({sessionId: 's1', endpoint: 'jupyter'}), res)
        assert.equal(res.statusCode, 502)
    })

    test('missing sessionId → 400', async () => {
        const mgr = {ensureServerStarted: mock.fn()}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({endpoint: 'jupyter'}), res)
        assert.equal(res.statusCode, 400)
        assert.equal(mgr.ensureServerStarted.mock.callCount(), 0)
    })

    test('unknown endpoint → 400', async () => {
        const mgr = {ensureServerStarted: mock.fn()}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({sessionId: 's1', endpoint: 'vscode'}), res)
        assert.equal(res.statusCode, 400)
        assert.equal(mgr.ensureServerStarted.mock.callCount(), 0)
    })

    test('missing sepal-user → 400', async () => {
        const mgr = {ensureServerStarted: mock.fn()}
        const {handler} = sandboxServerRoute(mgr)
        const res = mockRes()
        await handler(reqWithUser({sessionId: 's1', endpoint: 'jupyter', username: null}), res)
        assert.equal(res.statusCode, 400)
        assert.equal(mgr.ensureServerStarted.mock.callCount(), 0)
    })
})

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

const reqWithUser = ({username = 'alice', ...query} = {}) => ({
    method: 'POST',
    query,
    headers: username ? {'sepal-user': JSON.stringify({username, roles: []})} : {}
})
