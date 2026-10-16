import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

import {requireAdmin, requireAuth} from './currentUser.js'
import {registerSessionRoutes} from './routes.js'

// A recorder that mimics @koa/router's chainable .get/.post/.delete(path, ...middleware).
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

// Build a stub sessionsApi where every handler is a distinct mock.fn so we can assert dispatch.
const makeApi = () => ({
    generateReportSelf: mock.fn(),
    generateReportOther: mock.fn(),
    userUsageSelf: mock.fn(),
    userUsageOther: mock.fn(),
    mostRecentlyClosedByUser: mock.fn(),
    mostRecentlyClosed: mock.fn(),
    activeSessions: mock.fn(),
    associateApp: mock.fn(),
    startServer: mock.fn(),
    dissociateApp: mock.fn(),
    appSessions: mock.fn(),
    openSessions: mock.fn(),
    requestSessionSelf: mock.fn(),
    requestSessionOther: mock.fn(),
    heartbeatSelf: mock.fn(),
    heartbeatOther: mock.fn(),
    setKeepAlive: mock.fn(),
    extendNow: mock.fn(),
    openExtension: mock.fn(),
    dismissExpiry: mock.fn(),
    expiryPage: mock.fn(),
    redeemExpiryToken: mock.fn(),
    closeSessionSelf: mock.fn(),
    closeSessionOther: mock.fn(),
    closeUserSessions: mock.fn(),
    apiKeyAuthenticate: mock.fn(),
})

const find = (routes, method, path) => routes.find(r => r.method === method && r.path === path)

let router
let api
beforeEach(() => {
    router = makeRouter()
    api = makeApi()
    registerSessionRoutes(router, api)
})

// ── route table: method + path + guard + handler ──────────────────────────────

const expected = [
    ['get', '/sessions/report', requireAuth, 'generateReportSelf'],
    ['get', '/sessions/:username/report', requireAdmin, 'generateReportOther'],
    ['get', '/sessions/usage', requireAuth, 'userUsageSelf'],
    ['get', '/sessions/:username/usage', requireAdmin, 'userUsageOther'],
    ['get', '/sessions/mostRecentlyClosedByUser', requireAdmin, 'mostRecentlyClosedByUser'],
    ['get', '/sessions/mostRecentlyClosed', requireAdmin, 'mostRecentlyClosed'],
    ['get', '/sessions/active', requireAuth, 'activeSessions'],
    ['get', '/sessions/open', requireAdmin, 'openSessions'],
    ['get', '/sessions/app-sessions', requireAuth, 'appSessions'],
    ['post', '/sessions/instance-type/:instanceType', requireAuth, 'requestSessionSelf'],
    ['post', '/sessions/:username/instance-type/:instanceType', requireAdmin, 'requestSessionOther'],
    ['post', '/sessions/session/:sessionId', requireAuth, 'heartbeatSelf'],
    ['post', '/sessions/:username/session/:sessionId', requireAdmin, 'heartbeatOther'],
    ['post', '/sessions/session/:sessionId/keep-alive', requireAuth, 'setKeepAlive'],
    ['post', '/sessions/session/:sessionId/extend-now', requireAuth, 'extendNow'],
    ['post', '/sessions/session/:sessionId/opened', requireAuth, 'openExtension'],
    ['post', '/sessions/session/:sessionId/dismiss-expiry', requireAuth, 'dismissExpiry'],
    ['post', '/sessions/session/:sessionId/app', requireAuth, 'associateApp'],
    ['post', '/sessions/session/:sessionId/server/:endpoint', requireAuth, 'startServer'],
    ['delete', '/sessions/app', requireAuth, 'dissociateApp'],
    ['delete', '/sessions/session/:sessionId', requireAuth, 'closeSessionSelf'],
    ['delete', '/sessions/:username/session/:sessionId', requireAdmin, 'closeSessionOther'],
    ['delete', '/sessions/:username', requireAdmin, 'closeUserSessions'],
    ['post', '/sessions/api-key-authenticate', requireAdmin, 'apiKeyAuthenticate'],
]

test('registers exactly 26 routes', () => {
    assert.equal(router.routes.length, 26)
})

// The email links are clicked from a mail client, typically on a phone with no SEPAL session, so
// the token in the path is the ONLY credential. Guarding these would make them useless.
test('the email action routes carry no auth guard', () => {
    for (const method of ['get', 'post']) {
        const route = find(router.routes, method, '/sessions/expiry/:token')
        assert.notEqual(route, undefined)
        assert.ok(!route.middleware.includes(requireAuth))
        assert.ok(!route.middleware.includes(requireAdmin))
    }
})

// A mutating GET would be fired by mail-client link scanners, URL-rewriting proxies and preview
// fetchers, spending tokens for users who never opened the mail — and for the terminate link that
// means destroying an instance nobody asked to destroy. ONE route pair for both actions: the
// action is inside the signed token, so there is no path segment to disagree with the signature.
test('the expiry GET renders and the POST redeems', () => {
    assert.equal(
        find(router.routes, 'get', '/sessions/expiry/:token').middleware.at(-1),
        api.expiryPage
    )
    assert.equal(
        find(router.routes, 'post', '/sessions/expiry/:token').middleware.at(-1),
        api.redeemExpiryToken
    )
})

test('the unauthenticated expiry routes are registered before every guarded route', () => {
    assert.equal(router.routes[0].path, '/sessions/expiry/:token')
})

for (const [method, path, guard, handler] of expected) {
    test(`route ${method} ${path} wired with correct guard + handler`, () => {
        const route = find(router.routes, method, path)
        assert.notEqual(route, undefined)
        assert.ok(route.middleware.includes(guard))
        assert.equal(route.middleware[route.middleware.length - 1], api[handler])
    })
}

// literal / self routes must precede the :username wildcards so :username can't swallow them
test('literal routes registered before :username wildcards (same method)', () => {
    const posts = router.routes.filter(r => r.method === 'post').map(r => r.path)
    assert.ok(
        posts.indexOf('/sessions/session/:sessionId') < posts.indexOf('/sessions/:username/session/:sessionId')
    )
    const deletes = router.routes.filter(r => r.method === 'delete').map(r => r.path)
    assert.ok(deletes.indexOf('/sessions/app') < deletes.indexOf('/sessions/:username'))
    const gets = router.routes.filter(r => r.method === 'get').map(r => r.path)
    assert.ok(
        gets.indexOf('/sessions/mostRecentlyClosed') < gets.indexOf('/sessions/:username/report')
    )
    // /sessions/active is a literal and must precede the :username wildcard so it can't be swallowed
    assert.ok(
        gets.indexOf('/sessions/active') < gets.indexOf('/sessions/:username/report')
    )
    // /sessions/open is likewise a literal and must precede the :username wildcard
    assert.ok(
        gets.indexOf('/sessions/open') < gets.indexOf('/sessions/:username/report')
    )
    assert.ok(
        gets.indexOf('/sessions/usage') < gets.indexOf('/sessions/:username/report')
    )
})

// /sessions/active does not collide with any other GET /sessions/* literal, and there is no bare
// GET /sessions/:username route it could clash with.
test('/sessions/active is a distinct GET route with no colliding literal', () => {
    const active = router.routes.filter(r => r.method === 'get' && r.path === '/sessions/active')
    assert.equal(active.length, 1)
    const bareUsername = router.routes.find(r => r.method === 'get' && r.path === '/sessions/:username')
    assert.equal(bareUsername, undefined)
})

// /sessions/open is likewise a distinct, non-colliding literal — and admin-guarded (unlike /active).
test('/sessions/open is a distinct GET route, admin-guarded', () => {
    const open = router.routes.filter(r => r.method === 'get' && r.path === '/sessions/open')
    assert.equal(open.length, 1)
    assert.ok(open[0].middleware.includes(requireAdmin))
})

test('registers GET /sessions/app-sessions before the :username wildcard', () => {
    const gets = router.routes.filter(r => r.method === 'get').map(r => r.path)
    assert.ok(
        gets.indexOf('/sessions/app-sessions') < gets.indexOf('/sessions/:username/report')
    )
})

test('registers POST /sessions/session/:sessionId/app before the heartbeat route', () => {
    const posts = router.routes.filter(r => r.method === 'post').map(r => r.path)
    assert.ok(
        posts.indexOf('/sessions/session/:sessionId/app') < posts.indexOf('/sessions/session/:sessionId')
    )
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

test('auth route with no sepal-user header → 401, handler not called', async () => {
    const route = find(router.routes, 'get', '/sessions/report')
    const c = ctx()
    await runChain(route, c)
    assert.equal(c.status, 401)
    assert.equal(api.generateReportSelf.mock.callCount(), 0)
})

test('auth route with a valid header → handler called', async () => {
    const route = find(router.routes, 'get', '/sessions/report')
    const c = ctx({'sepal-user': JSON.stringify({username: 'u', roles: []})})
    await runChain(route, c)
    assert.equal(api.generateReportSelf.mock.callCount(), 1)
    assert.equal(c.state.currentUser.username, 'u')
})

test('admin route hit by a non-admin user → 403, handler not called', async () => {
    const route = find(router.routes, 'get', '/sessions/:username/report')
    const c = ctx({'sepal-user': JSON.stringify({username: 'u', roles: []})})
    await runChain(route, c)
    assert.equal(c.status, 403)
    assert.equal(api.generateReportOther.mock.callCount(), 0)
})

test('admin route hit by an application_admin → handler called', async () => {
    const route = find(router.routes, 'delete', '/sessions/:username')
    const c = ctx({'sepal-user': JSON.stringify({username: 'admin', roles: ['application_admin']})})
    await runChain(route, c)
    assert.equal(api.closeUserSessions.mock.callCount(), 1)
})

test('admin route with no header → 401', async () => {
    const route = find(router.routes, 'post', '/sessions/api-key-authenticate')
    const c = ctx()
    await runChain(route, c)
    assert.equal(c.status, 401)
    assert.equal(api.apiKeyAuthenticate.mock.callCount(), 0)
})

test('GET /sessions/open → 403 for a non-admin, called for an admin', async () => {
    const route = find(router.routes, 'get', '/sessions/open')
    const nonAdmin = ctx({'sepal-user': JSON.stringify({username: 'u', roles: []})})
    await runChain(route, nonAdmin)
    assert.equal(nonAdmin.status, 403)
    assert.equal(api.openSessions.mock.callCount(), 0)

    const admin = ctx({'sepal-user': JSON.stringify({username: 'admin', roles: ['application_admin']})})
    await runChain(route, admin)
    assert.equal(api.openSessions.mock.callCount(), 1)
})
