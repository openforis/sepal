import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

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
    report: mock.fn(),
    updateBudget: mock.fn(),
    requestUpdate: mock.fn(),
    spending: mock.fn(),
    check: mock.fn(),
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
    assert.equal(router.routes.length, 5)
})

for (const [method, path, guard, handler] of expected) {
    test(`route ${method} ${path} wired with correct guard + handler`, () => {
        const route = find(router.routes, method, path)
        assert.notEqual(route, undefined)
        assert.ok(route.middleware.includes(guard))
        assert.equal(route.middleware[route.middleware.length - 1], api[handler])
    })
}

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
    assert.equal(c.status, 401)
    assert.equal(api.report.mock.callCount(), 0)
})

test('GET /budget/report hit by a plain user → 403, handler not called', async () => {
    const route = find(router.routes, 'get', '/budget/report')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    assert.equal(c.status, 403)
    assert.equal(api.report.mock.callCount(), 0)
})

test('GET /budget/report hit by an admin → handler called', async () => {
    const route = find(router.routes, 'get', '/budget/report')
    const c = ctx(userHeader(['application_admin']))
    await runChain(route, c)
    assert.equal(api.report.mock.callCount(), 1)
})

test('POST /budget hit by a plain user → 403, handler not called', async () => {
    const route = find(router.routes, 'post', '/budget')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    assert.equal(c.status, 403)
    assert.equal(api.updateBudget.mock.callCount(), 0)
})

test('POST /budget hit by an admin → handler called', async () => {
    const route = find(router.routes, 'post', '/budget')
    const c = ctx(userHeader(['application_admin']))
    await runChain(route, c)
    assert.equal(api.updateBudget.mock.callCount(), 1)
})

test('POST /budget/requestUpdate hit by a plain authed user → handler called (no admin)', async () => {
    const route = find(router.routes, 'post', '/budget/requestUpdate')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    assert.equal(api.requestUpdate.mock.callCount(), 1)
    assert.equal(c.state.currentUser.username, 'u')
})

test('POST /budget/requestUpdate with no header → 401, handler not called', async () => {
    const route = find(router.routes, 'post', '/budget/requestUpdate')
    const c = ctx()
    await runChain(route, c)
    assert.equal(c.status, 401)
    assert.equal(api.requestUpdate.mock.callCount(), 0)
})

test('GET /budget/spending/:username with no sepal-user header → 401, handler not called', async () => {
    const route = find(router.routes, 'get', '/budget/spending/:username')
    const c = ctx()
    await runChain(route, c)
    assert.equal(c.status, 401)
    assert.equal(api.spending.mock.callCount(), 0)
})

test('GET /budget/spending/:username hit by a plain user → 403, handler not called', async () => {
    const route = find(router.routes, 'get', '/budget/spending/:username')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    assert.equal(c.status, 403)
    assert.equal(api.spending.mock.callCount(), 0)
})

test('GET /budget/spending/:username hit by an admin → handler called', async () => {
    const route = find(router.routes, 'get', '/budget/spending/:username')
    const c = ctx(userHeader(['application_admin']))
    await runChain(route, c)
    assert.equal(api.spending.mock.callCount(), 1)
})

test('GET /budget/check/:username with no sepal-user header → 401, handler not called', async () => {
    const route = find(router.routes, 'get', '/budget/check/:username')
    const c = ctx()
    await runChain(route, c)
    assert.equal(c.status, 401)
    assert.equal(api.check.mock.callCount(), 0)
})

test('GET /budget/check/:username hit by a plain user → 403, handler not called', async () => {
    const route = find(router.routes, 'get', '/budget/check/:username')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    assert.equal(c.status, 403)
    assert.equal(api.check.mock.callCount(), 0)
})

test('GET /budget/check/:username hit by an admin → handler called', async () => {
    const route = find(router.routes, 'get', '/budget/check/:username')
    const c = ctx(userHeader(['application_admin']))
    await runChain(route, c)
    assert.equal(api.check.mock.callCount(), 1)
})
