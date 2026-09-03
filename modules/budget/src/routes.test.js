import {jest} from '@jest/globals'

import {requireAdmin, requireAuth} from './currentUser.js'
import {registerBudgetRoutes} from './routes.js'

const makeRouter = () => {
    const routes = []
    const record = method => (path, ...middleware) => {
        routes.push({method, path, middleware})
        return router
    }
    const router = {
        get: record('get'),
        post: record('post'),
        routes,
    }
    return router
}

const makeApi = () => ({
    report: jest.fn(),
    updateBudget: jest.fn(),
    requestUpdate: jest.fn(),
    spending: jest.fn(),
    check: jest.fn(),
})

const find = (routes, method, path) => routes.find(r => r.method === method && r.path === path)

let router
let api
beforeEach(() => {
    router = makeRouter()
    api = makeApi()
    registerBudgetRoutes(router, api)
})

const expected = [
    ['get', '/budget/report', requireAdmin, 'report'],
    ['post', '/budget', requireAdmin, 'updateBudget'],
    ['post', '/budget/requestUpdate', requireAuth, 'requestUpdate'],
    ['get', '/budget/spending/:username', requireAdmin, 'spending'],
    ['get', '/budget/check/:username', requireAdmin, 'check'],
]

test('registers exactly 5 routes', () => {
    expect(router.routes).toHaveLength(5)
})

test.each(expected)('route %s %s wired with correct guard + handler', (method, path, guard, handler) => {
    const route = find(router.routes, method, path)
    expect(route).toBeDefined()
    expect(route.middleware).toContain(guard)
    expect(route.middleware[route.middleware.length - 1]).toBe(api[handler])
})

const runChain = async (route, ctx) => {
    let i = 0
    const next = async () => {
        const mw = route.middleware[i++]
        if (mw) {
            await mw(ctx, next)
        }
    }
    await next()
}

const ctx = (headers = {}) => ({
    headers, state: {}, params: {}, query: {}, request: {body: {}},
})
const userHeader = roles => ({'sepal-user': JSON.stringify({username: 'u', roles})})

test('GET /budget/report with no sepal-user header → 401, handler not called', async () => {
    const route = find(router.routes, 'get', '/budget/report')
    const c = ctx()
    await runChain(route, c)
    expect(c.status).toBe(401)
    expect(api.report).not.toHaveBeenCalled()
})

test('GET /budget/report hit by a plain user → 403, handler not called', async () => {
    const route = find(router.routes, 'get', '/budget/report')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    expect(c.status).toBe(403)
    expect(api.report).not.toHaveBeenCalled()
})

test('GET /budget/report hit by an admin → handler called', async () => {
    const route = find(router.routes, 'get', '/budget/report')
    const c = ctx(userHeader(['application_admin']))
    await runChain(route, c)
    expect(api.report).toHaveBeenCalledTimes(1)
})

test('POST /budget hit by a plain user → 403, handler not called', async () => {
    const route = find(router.routes, 'post', '/budget')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    expect(c.status).toBe(403)
    expect(api.updateBudget).not.toHaveBeenCalled()
})

test('POST /budget hit by an admin → handler called', async () => {
    const route = find(router.routes, 'post', '/budget')
    const c = ctx(userHeader(['application_admin']))
    await runChain(route, c)
    expect(api.updateBudget).toHaveBeenCalledTimes(1)
})

test('POST /budget/requestUpdate hit by a plain authed user → handler called (no admin)', async () => {
    const route = find(router.routes, 'post', '/budget/requestUpdate')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    expect(api.requestUpdate).toHaveBeenCalledTimes(1)
    expect(c.state.currentUser.username).toBe('u')
})

test('POST /budget/requestUpdate with no header → 401, handler not called', async () => {
    const route = find(router.routes, 'post', '/budget/requestUpdate')
    const c = ctx()
    await runChain(route, c)
    expect(c.status).toBe(401)
    expect(api.requestUpdate).not.toHaveBeenCalled()
})

test('GET /budget/spending/:username with no sepal-user header → 401, handler not called', async () => {
    const route = find(router.routes, 'get', '/budget/spending/:username')
    const c = ctx()
    await runChain(route, c)
    expect(c.status).toBe(401)
    expect(api.spending).not.toHaveBeenCalled()
})

test('GET /budget/spending/:username hit by a plain user → 403, handler not called', async () => {
    const route = find(router.routes, 'get', '/budget/spending/:username')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    expect(c.status).toBe(403)
    expect(api.spending).not.toHaveBeenCalled()
})

test('GET /budget/spending/:username hit by an admin → handler called', async () => {
    const route = find(router.routes, 'get', '/budget/spending/:username')
    const c = ctx(userHeader(['application_admin']))
    await runChain(route, c)
    expect(api.spending).toHaveBeenCalledTimes(1)
})

test('GET /budget/check/:username with no sepal-user header → 401, handler not called', async () => {
    const route = find(router.routes, 'get', '/budget/check/:username')
    const c = ctx()
    await runChain(route, c)
    expect(c.status).toBe(401)
    expect(api.check).not.toHaveBeenCalled()
})

test('GET /budget/check/:username hit by a plain user → 403, handler not called', async () => {
    const route = find(router.routes, 'get', '/budget/check/:username')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    expect(c.status).toBe(403)
    expect(api.check).not.toHaveBeenCalled()
})

test('GET /budget/check/:username hit by an admin → handler called', async () => {
    const route = find(router.routes, 'get', '/budget/check/:username')
    const c = ctx(userHeader(['application_admin']))
    await runChain(route, c)
    expect(api.check).toHaveBeenCalledTimes(1)
})
