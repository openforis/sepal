// routes — the /sessions Koa router.
//
// Mounted on the worker Koa app so that the gateway's `/api/sessions/*` (the gateway strips
// `/api`) maps to `/sessions/*` here.
//
// Route ORDER matters: @koa/router matches in registration order, so the literal / self routes
// (report, mostRecentlyClosedByUser, mostRecentlyClosed, instance-type/*, session/*) are
// registered BEFORE the `:username` wildcard routes — otherwise `:username` would swallow
// `mostRecentlyClosed`, `session`, etc.
//
// Auth: requireAuth = any authenticated user; requireAdmin = application_admin.

import {requireAdmin, requireAuth} from './currentUser.js'

const registerSessionRoutes = (router, api) => router
    // ── expiry email links (UNAUTHENTICATED) ────────────────────────────────────
    // Registered FIRST, and deliberately without requireAuth: the links are clicked from an email,
    // typically on a phone with no SEPAL session, and the token carries its own authority. The
    // gateway matches /api/sessions/expiry before its authenticated /api/sessions entry.
    // ONE route pair serves both keep-running and terminate: the action is signed INTO the token,
    // so a path segment can never disagree with the signature.
    // The GET only renders — it must not mutate, or link scanners and preview fetchers would
    // spend tokens for users who never opened the mail.
    .get('/sessions/expiry/:token', api.expiryPage)
    .post('/sessions/expiry/:token', api.redeemExpiryToken)

    // ── GET report ──────────────────────────────────────────────────────────────
    .get('/sessions/report', requireAuth, api.generateReportSelf)
    .get('/sessions/mostRecentlyClosedByUser', requireAdmin, api.mostRecentlyClosedByUser)
    // GET /sessions/mostRecentlyClosed has no :username path segment: the handler reads the
    // username from the query string via pathUser(ctx).
    .get('/sessions/mostRecentlyClosed', requireAdmin, api.mostRecentlyClosed)
    // GET /sessions/active — current user's PENDING+ACTIVE SANDBOX sessions (gateway phase-6
    // cache-miss fallback). Literal, registered BEFORE the /sessions/:username wildcard so it
    // can't be swallowed. Non-colliding: no other GET /sessions/<segment> literal is `active`,
    // and there is no bare GET /sessions/:username route.
    .get('/sessions/active', requireAuth, api.activeSessions)
    // GET /sessions/open (admin) — ALL currently-open (PENDING+ACTIVE) sessions across every user,
    // for the budget module's boot seed + hourly reconciler. Literal, registered before the
    // :username wildcard for the same reason as /sessions/active above.
    .get('/sessions/open', requireAdmin, api.openSessions)
    // GET /sessions/app-sessions — literal, BEFORE the :username wildcard routes.
    .get('/sessions/app-sessions', requireAuth, api.appSessions)
    .get('/sessions/:username/report', requireAdmin, api.generateReportOther)
    // GET /sessions/:username/usage (admin) — aggregate resource usage for the user-details form.
    .get('/sessions/:username/usage', requireAdmin, api.userUsage)

    // ── POST request session ──────────────────────────────────────────────────
    .post('/sessions/instance-type/:instanceType', requireAuth, api.requestSessionSelf)
    .post('/sessions/:username/instance-type/:instanceType', requireAdmin, api.requestSessionOther)

    // ── POST heartbeat / deadline extension ────────────────────────────────────
    // Every extension route reaches the same ratchet; they differ only in magnitude and in
    // whether the caller is told it landed (the one-shots are, the recurring signals are not).
    // keep-alive is the exception: it SETS the deadline, so it can shorten a session too.
    .post('/sessions/session/:sessionId/keep-alive', requireAuth, api.setKeepAlive)
    .post('/sessions/session/:sessionId/extend-now', requireAuth, api.extendNow)
    .post('/sessions/session/:sessionId/opened', requireAuth, api.openExtension)
    .post('/sessions/session/:sessionId/dismiss-expiry', requireAuth, api.dismissExpiry)
    // POST app association — BEFORE the bare heartbeat route so /app isn't swallowed.
    .post('/sessions/session/:sessionId/app', requireAuth, api.associateApp)
    // POST start an on-demand sandbox server — BEFORE the bare heartbeat route, for the same
    // reason /app is: otherwise `:sessionId` swallows the extra segments.
    .post('/sessions/session/:sessionId/server/:endpoint', requireAuth, api.startServer)
    .post('/sessions/session/:sessionId', requireAuth, api.heartbeatSelf)
    .post('/sessions/:username/session/:sessionId', requireAdmin, api.heartbeatOther)

    // ── DELETE close ────────────────────────────────────────────────────────────
    // DELETE app association (tab close) — literal, BEFORE the :username wildcard delete.
    .delete('/sessions/app', requireAuth, api.dissociateApp)
    .delete('/sessions/session/:sessionId', requireAuth, api.closeSessionSelf)
    .delete('/sessions/:username/session/:sessionId', requireAdmin, api.closeSessionOther)
    .delete('/sessions/:username', requireAdmin, api.closeUserSessions)

    // ── POST api-key authenticate ──────────────────────────────────────────────
    .post('/sessions/api-key-authenticate', requireAdmin, api.apiKeyAuthenticate)

export {registerSessionRoutes}
