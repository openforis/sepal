// routes tests — verify the 9 /tasks routes are registered with the correct HTTP method, path,
// auth guard (requireAuth vs requireAdminOrTaskExecutor), and handler, and that the middleware chain
// enforces auth (missing header → 401; the executor routes → 403 for a plain user, pass for
// task_executor / admin).
//
// As in the /sessions routes test, we drive a fake @koa/router-shaped recorder that captures each
// registration, then execute the captured middleware chain against a synthetic ctx. This exercises
// the real currentUser guards + real handler dispatch.

import {jest} from '@jest/globals'

import {requireAdminOrTaskExecutor, requireAuth} from '../workerSession/currentUser.js'
import {registerTaskRoutes} from './routes.js'

const makeRouter = () => {
    const routes = []
    const record = method => (path, ...middleware) => {
        routes.push({method, path, middleware})
        return router
    }
    const router = {
        get: record('get'),
        post: record('post'),
        delete: record('delete'),
        routes,
    }
    return router
}

const makeApi = () => ({
    submitTask: jest.fn(),
    getTask: jest.fn(),
    getTaskDetails: jest.fn(),
    cancelTask: jest.fn(),
    removeTask: jest.fn(),
    executeTask: jest.fn(),
    removeUserTasks: jest.fn(),
    stateUpdated: jest.fn(),
    active: jest.fn(),
})

const find = (routes, method, path) => routes.find(r => r.method === method && r.path === path)

let router
let api
beforeEach(() => {
    router = makeRouter()
    api = makeApi()
    registerTaskRoutes(router, api)
})

// ── route table: method + path + guard + handler ──────────────────────────────

const expected = [
    ['post', '/tasks', requireAuth, 'submitTask'],
    ['post', '/tasks/active', requireAdminOrTaskExecutor, 'active'],
    ['post', '/tasks/remove', requireAuth, 'removeUserTasks'],
    ['get', '/tasks/task/:id/details', requireAuth, 'getTaskDetails'],
    ['get', '/tasks/task/:id', requireAuth, 'getTask'],
    ['post', '/tasks/task/:id/cancel', requireAuth, 'cancelTask'],
    ['post', '/tasks/task/:id/remove', requireAuth, 'removeTask'],
    ['post', '/tasks/task/:id/execute', requireAuth, 'executeTask'],
    ['post', '/tasks/task/:id/state-updated', requireAdminOrTaskExecutor, 'stateUpdated'],
]

test('registers exactly 9 routes', () => {
    expect(router.routes).toHaveLength(9)
})

test.each(expected)('route %s %s wired with correct guard + handler', (method, path, guard, handler) => {
    const route = find(router.routes, method, path)
    expect(route).toBeDefined()
    expect(route.middleware).toContain(guard)
    expect(route.middleware[route.middleware.length - 1]).toBe(api[handler])
})

// literal routes must precede the /tasks/task/:id wildcards (same method) so the :id segment can't
// swallow the literal /tasks/active + /tasks/remove; and details before the bare /:id.
test('literal routes registered before :id wildcards (same method)', () => {
    const posts = router.routes.filter(r => r.method === 'post').map(r => r.path)
    expect(posts.indexOf('/tasks/active'))
        .toBeLessThan(posts.indexOf('/tasks/task/:id/cancel'))
    expect(posts.indexOf('/tasks/remove'))
        .toBeLessThan(posts.indexOf('/tasks/task/:id/remove'))
    const gets = router.routes.filter(r => r.method === 'get').map(r => r.path)
    expect(gets.indexOf('/tasks/task/:id/details'))
        .toBeLessThan(gets.indexOf('/tasks/task/:id'))
})

// ── auth enforcement by executing the captured middleware chain ────────────────

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

test('authed route with no sepal-user header → 401, handler not called', async () => {
    const route = find(router.routes, 'post', '/tasks')
    const c = ctx()
    await runChain(route, c)
    expect(c.status).toBe(401)
    expect(api.submitTask).not.toHaveBeenCalled()
})

test('authed route with a valid header → handler called', async () => {
    const route = find(router.routes, 'post', '/tasks')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    expect(api.submitTask).toHaveBeenCalledTimes(1)
    expect(c.state.currentUser.username).toBe('u')
})

test('executor route hit by a plain user → 403, handler not called', async () => {
    const route = find(router.routes, 'post', '/tasks/active')
    const c = ctx(userHeader([]))
    await runChain(route, c)
    expect(c.status).toBe(403)
    expect(api.active).not.toHaveBeenCalled()
})

test('executor route hit by a task_executor → handler called', async () => {
    const route = find(router.routes, 'post', '/tasks/active')
    const c = ctx(userHeader(['task_executor']))
    await runChain(route, c)
    expect(api.active).toHaveBeenCalledTimes(1)
})

test('executor route hit by an application_admin → handler called', async () => {
    const route = find(router.routes, 'post', '/tasks/task/:id/state-updated')
    const c = ctx(userHeader(['application_admin']))
    await runChain(route, c)
    expect(api.stateUpdated).toHaveBeenCalledTimes(1)
})

test('executor route with no header → 401', async () => {
    const route = find(router.routes, 'post', '/tasks/task/:id/state-updated')
    const c = ctx()
    await runChain(route, c)
    expect(c.status).toBe(401)
    expect(api.stateUpdated).not.toHaveBeenCalled()
})
