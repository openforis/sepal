// routes tests — verify the /sessions routes are registered with the correct HTTP method, path,
// auth guard (requireAuth vs requireAdmin), and handler, and that the middleware chain enforces auth
// (missing header → 401; non-admin on an [ADMIN] route → 403).
//
// Rather than boot the real Koa http server (koa lives in the shared lib's node_modules, imported
// transitively via #sepal/httpServer), we drive a fake @koa/router-shaped recorder that captures
// each registration, then execute the captured middleware chain against a synthetic ctx. This
// exercises the real currentUser guards + real handler dispatch.

import {jest} from '@jest/globals'

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

// Build a stub sessionsApi where every handler is a distinct jest.fn so we can assert dispatch.
const makeApi = () => ({
    generateReportSelf: jest.fn(),
    generateReportOther: jest.fn(),
    userUsage: jest.fn(),
    mostRecentlyClosedByUser: jest.fn(),
    mostRecentlyClosed: jest.fn(),
    activeSessions: jest.fn(),
    associateApp: jest.fn(),
    startServer: jest.fn(),
    dissociateApp: jest.fn(),
    appSessions: jest.fn(),
    openSessions: jest.fn(),
    requestSessionSelf: jest.fn(),
    requestSessionOther: jest.fn(),
    heartbeatSelf: jest.fn(),
    heartbeatOther: jest.fn(),
    setKeepAlive: jest.fn(),
    extendNow: jest.fn(),
    openExtension: jest.fn(),
    dismissExpiry: jest.fn(),
    expiryPage: jest.fn(),
    redeemExpiryToken: jest.fn(),
    closeSessionSelf: jest.fn(),
    closeSessionOther: jest.fn(),
    closeUserSessions: jest.fn(),
    apiKeyAuthenticate: jest.fn(),
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
    ['get', '/sessions/:username/usage', requireAdmin, 'userUsage'],
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

test('registers exactly 25 routes', () => {
    expect(router.routes).toHaveLength(25)
})

// The email links are clicked from a mail client, typically on a phone with no SEPAL session, so
// the token in the path is the ONLY credential. Guarding these would make them useless.
test('the email action routes carry no auth guard', () => {
    for (const method of ['get', 'post']) {
        const route = find(router.routes, method, '/sessions/expiry/:token')
        expect(route).toBeDefined()
        expect(route.middleware).not.toContain(requireAuth)
        expect(route.middleware).not.toContain(requireAdmin)
    }
})

// A mutating GET would be fired by mail-client link scanners, URL-rewriting proxies and preview
// fetchers, spending tokens for users who never opened the mail — and for the terminate link that
// means destroying an instance nobody asked to destroy. ONE route pair for both actions: the
// action is inside the signed token, so there is no path segment to disagree with the signature.
test('the expiry GET renders and the POST redeems', () => {
    expect(find(router.routes, 'get', '/sessions/expiry/:token').middleware.at(-1)).toBe(api.expiryPage)
    expect(find(router.routes, 'post', '/sessions/expiry/:token').middleware.at(-1)).toBe(api.redeemExpiryToken)
})

test('the unauthenticated expiry routes are registered before every guarded route', () => {
    expect(router.routes[0].path).toBe('/sessions/expiry/:token')
})

test.each(expected)('route %s %s wired with correct guard + handler', (method, path, guard, handler) => {
    const route = find(router.routes, method, path)
    expect(route).toBeDefined()
    expect(route.middleware).toContain(guard)
    expect(route.middleware[route.middleware.length - 1]).toBe(api[handler])
})

// literal / self routes must precede the :username wildcards so :username can't swallow them
test('literal routes registered before :username wildcards (same method)', () => {
    const posts = router.routes.filter(r => r.method === 'post').map(r => r.path)
    expect(posts.indexOf('/sessions/session/:sessionId'))
        .toBeLessThan(posts.indexOf('/sessions/:username/session/:sessionId'))
    const deletes = router.routes.filter(r => r.method === 'delete').map(r => r.path)
    expect(deletes.indexOf('/sessions/app'))
        .toBeLessThan(deletes.indexOf('/sessions/:username'))
    const gets = router.routes.filter(r => r.method === 'get').map(r => r.path)
    expect(gets.indexOf('/sessions/mostRecentlyClosed'))
        .toBeLessThan(gets.indexOf('/sessions/:username/report'))
    // /sessions/active is a literal and must precede the :username wildcard so it can't be swallowed
    expect(gets.indexOf('/sessions/active'))
        .toBeLessThan(gets.indexOf('/sessions/:username/report'))
    // /sessions/open is likewise a literal and must precede the :username wildcard
    expect(gets.indexOf('/sessions/open'))
        .toBeLessThan(gets.indexOf('/sessions/:username/report'))
})

// /sessions/active does not collide with any other GET /sessions/* literal, and there is no bare
// GET /sessions/:username route it could clash with.
test('/sessions/active is a distinct GET route with no colliding literal', () => {
    const active = router.routes.filter(r => r.method === 'get' && r.path === '/sessions/active')
    expect(active).toHaveLength(1)
    const bareUsername = router.routes.find(r => r.method === 'get' && r.path === '/sessions/:username')
    expect(bareUsername).toBeUndefined()
})

// /sessions/open is likewise a distinct, non-colliding literal — and admin-guarded (unlike /active).
test('/sessions/open is a distinct GET route, admin-guarded', () => {
    const open = router.routes.filter(r => r.method === 'get' && r.path === '/sessions/open')
    expect(open).toHaveLength(1)
    expect(open[0].middleware).toContain(requireAdmin)
})

test('registers GET /sessions/app-sessions before the :username wildcard', () => {
    const gets = router.routes.filter(r => r.method === 'get').map(r => r.path)
    expect(gets.indexOf('/sessions/app-sessions'))
        .toBeLessThan(gets.indexOf('/sessions/:username/report'))
})

test('registers POST /sessions/session/:sessionId/app before the heartbeat route', () => {
    const posts = router.routes.filter(r => r.method === 'post').map(r => r.path)
    expect(posts.indexOf('/sessions/session/:sessionId/app'))
        .toBeLessThan(posts.indexOf('/sessions/session/:sessionId'))
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
    expect(c.status).toBe(401)
    expect(api.generateReportSelf).not.toHaveBeenCalled()
})

test('auth route with a valid header → handler called', async () => {
    const route = find(router.routes, 'get', '/sessions/report')
    const c = ctx({'sepal-user': JSON.stringify({username: 'u', roles: []})})
    await runChain(route, c)
    expect(api.generateReportSelf).toHaveBeenCalledTimes(1)
    expect(c.state.currentUser.username).toBe('u')
})

test('admin route hit by a non-admin user → 403, handler not called', async () => {
    const route = find(router.routes, 'get', '/sessions/:username/report')
    const c = ctx({'sepal-user': JSON.stringify({username: 'u', roles: []})})
    await runChain(route, c)
    expect(c.status).toBe(403)
    expect(api.generateReportOther).not.toHaveBeenCalled()
})

test('admin route hit by an application_admin → handler called', async () => {
    const route = find(router.routes, 'delete', '/sessions/:username')
    const c = ctx({'sepal-user': JSON.stringify({username: 'admin', roles: ['application_admin']})})
    await runChain(route, c)
    expect(api.closeUserSessions).toHaveBeenCalledTimes(1)
})

test('admin route with no header → 401', async () => {
    const route = find(router.routes, 'post', '/sessions/api-key-authenticate')
    const c = ctx()
    await runChain(route, c)
    expect(c.status).toBe(401)
    expect(api.apiKeyAuthenticate).not.toHaveBeenCalled()
})

test('GET /sessions/open → 403 for a non-admin, called for an admin', async () => {
    const route = find(router.routes, 'get', '/sessions/open')
    const nonAdmin = ctx({'sepal-user': JSON.stringify({username: 'u', roles: []})})
    await runChain(route, nonAdmin)
    expect(nonAdmin.status).toBe(403)
    expect(api.openSessions).not.toHaveBeenCalled()

    const admin = ctx({'sepal-user': JSON.stringify({username: 'admin', roles: ['application_admin']})})
    await runChain(route, admin)
    expect(api.openSessions).toHaveBeenCalledTimes(1)
})
