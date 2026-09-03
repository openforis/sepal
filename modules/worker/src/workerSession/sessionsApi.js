// sessionsApi — HTTP handlers for the /sessions routes.
//
// Each handler resolves a `username` + a `forCurrentUser` flag (self routes use
// ctx.state.currentUser.username + forCurrentUser=true; admin-proxied {username} routes use the
// path param + forCurrentUser=false), then calls the sessionManager surface.
//
// Serialization:
//   status  — PENDING → 'STARTING', otherwise → 'ACTIVE'
//   host    — session.instance.host
//   path    — self:  `sessions/session/{id}`
//             admin: `sessions/{username}/session/{id}`
//   report  — { sessions, instanceTypes }
//   session (in report) — { id, path, username, status, host, timeoutHours, expiry{...},
//                           instanceType{...}, creationTime (ISO 8601 UTC instant),
//                           costSinceCreation, apps[], terminals, verdict, usage{...} }

import {launchFailureCode} from '../hostingService/instanceLaunchErrors.js'
import {instanceName} from '../instanceName.js'
import {State} from './workerSession.js'

const SANDBOX = 'sandbox'

// ── serialization helpers ──────────────────────────────────────────────────────

// sessionStatus — PENDING → 'STARTING', else 'ACTIVE'.
const sessionStatus = session =>
    session.state === State.PENDING ? 'STARTING' : 'ACTIVE'

// sessionPath — self form or admin-proxied form.
const sessionPath = (session, username, forCurrentUser) =>
    `sessions/${forCurrentUser ? '' : `${username}/`}session/${session.id}`

// instanceTypePath — self form or admin-proxied form.
const instanceTypePath = (instanceType, username, forCurrentUser) =>
    `sessions/${forCurrentUser ? '' : `${username}/`}instance-type/${instanceType.id}`

// hoursBetween — hours between two dates, 0 if either is missing.
const hoursBetween = (startTime, endTime) => {
    if (!startTime || !endTime) {
        return 0
    }
    const secs = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
    return secs / 3600
}

// round2 — round half-up to 2 decimals.
const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100

const instanceTypeAsMap = (instanceType, username, forCurrentUser) => ({
    id: instanceType.id,
    path: instanceTypePath(instanceType, username, forCurrentUser),
    name: instanceType.name,
    tag: instanceType.tag,
    cpuCount: instanceType.cpuCount,
    ramGiB: instanceType.ramGiB,
    gpuCount: instanceType.gpuCount ?? 0,
    description: instanceType.description,
    hourlyCost: instanceType.hourlyCost,
})

// ── the email links' pages ─────────────────────────────────────────────────────
// Plain self-contained HTML: this is opened from a mail client, often on a phone, by someone with
// no SEPAL session and possibly no SEPAL tab. It cannot rely on the GUI being reachable.
const page = body => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEPAL</title>
<style>
body {font-family: system-ui, sans-serif; margin: 0; padding: 3rem 1.5rem; background: #17181c; color: #e8e8ea; text-align: center}
h1 {font-size: 1.4rem; font-weight: 500}
p {color: #a8a9ad; line-height: 1.5}
/* The two looks the in-app notification uses for the same choice: --look-add and --look-cancel
   (modules/gui/src/style/look.css). Inlined as literals because this page is standalone. */
button {font: inherit; min-width: 15rem; padding: .9rem 1.8rem; border: 0; border-radius: .3rem; background: hsl(105, 50%, 25%); color: #fff; cursor: pointer}
button.stop {background: hsl(0, 45%, 33%)}
form {margin: 2.5rem 0}
form + form {margin-top: 3rem}
p.small {font-size: .9rem}
</style>
</head>
<body>${body}</body>
</html>`

// instanceText — "Instance <b>crazy-banana</b> (t3a.small, $0.02/h)", the same name the in-app
// notification, the expiry email and the SSH menu give this machine (instanceName.js). A user with
// two instances has to be able to tell which one a page is about before pressing anything on it,
// and the price is what makes "keep it running" a real decision rather than a reflex.
//
// The unnamed variant mirrors the GUI's `instanceUnnamed`: better than a blank where an identity
// should be. A type with no known cost simply drops the price rather than printing a zero.
const typeAndCost = ({typeName, hourlyCost}) => {
    const parts = [typeName, hourlyCost ? `$${hourlyCost.toFixed(2)}/h` : null].filter(Boolean)
    return parts.length ? ` (${parts.join(', ')})` : ''
}

const instanceText = description =>
    description?.name
        ? `Instance <b>${description.name}</b>${typeAndCost(description)}`
        : 'One of your instances'

// Each button is its own form so the POST carries exactly one action and nothing is inferred from
// which control happened to be focused. action="" posts back to the very URL that rendered the
// page, so it needs to know nothing about the deployment's external base path.
const actionForm = (action, label, look = '') => `
<form method="post" action="">
<input type="hidden" name="action" value="${action}">
<button type="submit"${look ? ` class="${look}"` : ''}>${label}</button>
</form>`

// The mail carries ONE link, and this is where the choice is actually made. Both buttons sit here
// rather than in the mail so that reaching the destructive one always costs a page load first — a
// mis-tap on a phone is recoverable by reading before pressing.
const managePage = (minutes, description) => page(`
<h1>${instanceText(description)} is about to be stopped</h1>
<p>It has not been used for a while. Keep it running, or terminate it now and free the cost.</p>
<p class="small">Terminating closes anything running on it. Your files are untouched either way —
everything in your home directory is preserved.</p>
${actionForm('extend', `Keep it running ${minutes} min`)}
${actionForm('terminate', 'Terminate now', 'stop')}`)

const extendedPage = description => page(`
<h1>${instanceText(description)} will keep running</h1>
<p>You can close this page.</p>`)

const terminatedPage = description => page(`
<h1>${instanceText(description)} was stopped</h1>
<p>Your files are untouched — everything in your home directory is preserved, and you can start a
new instance at any time. You can close this page.</p>`)

const expiredPage = () => page(`
<h1>This link is no longer valid</h1>
<p>Either it was already used, or the instance has since been stopped or kept running some other
way. Open SEPAL to check — your files are untouched either way.</p>`)

const createSessionsApi = ({sessionManager, sandboxServers, clock = () => new Date(), expiryPolicy = {}, expiryTokens = null}) => {
    // hoursSince — ceil of the whole minutes since `date`, over 60. The minutes are FLOORED first,
    // so a 1h0m45s session is 60 min → 1h, not 2h.
    const hoursSince = date => {
        const minutes = Math.floor((clock().getTime() - new Date(date).getTime()) / 1000 / 60)
        return Math.ceil(minutes / 60)
    }

    // usageAsMap — latest sampler reading, or null when absent/stale. Stale (sampler broken,
    // instance unreachable) must not render as live data in the GUI.
    const MAX_USAGE_AGE_MS = 5 * 60_000
    const usageAsMap = usage => {
        if (!usage || clock().getTime() - new Date(usage.sampleTime).getTime() > MAX_USAGE_AGE_MS) {
            return null
        }
        return {
            cpuPct: usage.cpuPct,
            ramPct: usage.ramPct,
            gpuPct: usage.gpuPct,
            // rx + tx, the same sum the busy verdict thresholds — so the number the GUI shows is
            // the number that decides whether the session counts as used.
            netBytesPerS: usage.netBytesPerS ?? null,
            sampleTime: new Date(usage.sampleTime).toISOString(),
        }
    }

    // expiryAsMap — the stored deadline and where the session sits in the notification cycle.
    // closeTime is only populated under enforcement: in notify mode nothing closes, and a
    // countdown to a close that will not happen is a lie the GUI would render faithfully.
    const expiryAsMap = session => ({
        state: session.notificationState ?? 'NONE',
        timeoutTime: session.timeoutTime ? new Date(session.timeoutTime).toISOString() : null,
        notifiedTime: session.notifiedTime ? new Date(session.notifiedTime).toISOString() : null,
        closeTime: session.notifiedTime && expiryPolicy.mode === 'enforce'
            ? new Date(new Date(session.notifiedTime).getTime() + expiryPolicy.graceMinutes * 60_000).toISOString()
            : null,
    })

    const sessionAsMap = (session, instanceType, username, forCurrentUser) => {
        return {
            id: session.id,
            // Derived, not stored (instanceName.js) — the GUI, the notification, the expiry mail
            // and the SSH menu all name this machine the same way because they all name it from
            // its id.
            name: instanceName(session.id),
            path: sessionPath(session, username, forCurrentUser),
            username,
            status: sessionStatus(session),
            host: session.instance.host,
            // Hours left on the stored deadline. This IS the keep-alive slider's cursor position,
            // and the slider sets it absolutely, so the two must agree: what the cursor shows is
            // what dragging it elsewhere replaces.
            timeoutHours: Math.max(0, hoursBetween(new Date(), session.timeoutTime)),
            instanceType: instanceTypeAsMap(instanceType, username, forCurrentUser),
            creationTime: new Date(session.creationTime).toISOString(),
            costSinceCreation: round2(instanceType.hourlyCost * hoursSince(session.creationTime)),
            apps: session.apps ?? [],
            terminals: session.terminals ?? 0,
            verdict: session.verdict ?? 'unknown',
            usage: usageAsMap(session.usage),
            expiry: expiryAsMap(session),
        }
    }

    const reportAsMap = (report, username, forCurrentUser) => {
        const instanceTypeById = Object.fromEntries(
            report.instanceTypes.map(it => [it.id, it])
        )
        return {
            sessions: report.sessions.map(session =>
                sessionAsMap(session, instanceTypeById[session.instanceType], username, forCurrentUser)),
            instanceTypes: report.instanceTypes.map(it => instanceTypeAsMap(it, username, forCurrentUser)),
        }
    }

    const sessionResponse = (session, username, forCurrentUser) => ({
        id: session.id,
        path: sessionPath(session, username, forCurrentUser),
        username,
        status: sessionStatus(session),
        host: session.instance.host,
    })

    // activeSessionResponse — the lean lookup shape used by GET /sessions/active (the gateway's
    // sandbox-session cache-miss fallback). It adds instanceType and needs no path/username.
    const activeSessionResponse = session => ({
        id: session.id,
        host: session.instance.host,
        status: sessionStatus(session),
        instanceType: session.instanceType,
    })

    // ── request-context resolution ────────────────────────────────────────────
    // self routes → currentUser.username, forCurrentUser=true
    const selfUser = ctx => ({
        username: ctx.state.currentUser.username?.toLowerCase(),
        forCurrentUser: true,
    })
    // admin {username} routes → path param, forCurrentUser=false
    const pathUser = ctx => ({
        username: ctx.params.username?.toLowerCase(),
        forCurrentUser: false,
    })

    // ── report handlers ────────────────────────────────────────────────────────
    const buildReport = async (username, forCurrentUser) => {
        const report = await sessionManager.generateUserSessionReport({username, workerType: SANDBOX})
        return reportAsMap(report, username, forCurrentUser)
    }

    const generateReport = resolve => async ctx => {
        const {username, forCurrentUser} = resolve(ctx)
        ctx.body = await buildReport(username, forCurrentUser)
    }

    // ── per-user usage report (admin; phase-4 upgrade-decision support) ─────────
    const DEFAULT_USAGE_DAYS = 30
    const userUsage = async ctx => {
        const {username} = pathUser(ctx)
        const parsed = parseInt(ctx.query.days)
        const days = Number.isFinite(parsed)
            ? Math.min(365, Math.max(1, parsed))
            : DEFAULT_USAGE_DAYS
        ctx.body = await sessionManager.generateUserUsageReport({username, days})
    }

    // userSessions — {sessions} for the SELF report, no Koa ctx, for the session ws (./ws.js).
    // Built by the same buildReport the REST route uses, so each session is serialised identically
    // — but instanceTypes is dropped: it is a static list (instanceManager config, changes only on
    // redeployment) and was 93% of the payload on every push. The GUI reads the list from
    // GET /sessions/report when the instance picker opens (app/home/body/apps/instancePicker.jsx);
    // it never read the pushed copy. Sessions still embed their own instanceType, so the Usage
    // panel is unaffected.
    const userSessions = async username => ({
        sessions: (await buildReport(username, true)).sessions
    })

    // ── active/pending sandbox sessions (self) ──────────────────────────────────
    // The current user's PENDING+ACTIVE SANDBOX sessions. The gateway uses this to resolve a
    // user's sandbox-session host on a cache miss. Returns [] when the user has no such session.
    const activeSessions = async ctx => {
        const {username} = selfUser(ctx)
        const sessions = await sessionManager.userWorkerSessions({
            username,
            states: [State.PENDING, State.ACTIVE],
            workerType: SANDBOX,
        })
        ctx.body = sessions.map(activeSessionResponse)
    }

    const mostRecentlyClosedByUser = async ctx => {
        ctx.body = await sessionManager.mostRecentlyClosedSessionByUser()
    }

    // ── app ↔ session association ────────────────────────────────────────────
    // POST /sessions/session/:sessionId/app  body {path, label, clientId} → 201
    // clientId (optional) — the browser ws client owning the app's tab; stored on the
    // association (clientDown dissociates by it) and refreshed when an existing
    // association wins.
    // reassert (optional) — the GUI replaying an open tab's association after a ws reconnect;
    // ownership is refreshed but no deadline moves. Only a literal `true` counts, so a garbled
    // body reads as a real open and errs toward keeping the session alive.
    const associateApp = async ctx => {
        const {username} = selfUser(ctx)
        const {path, label, clientId, reassert} = ctx.request.body ?? {}
        if (!path) {
            ctx.status = 400
            ctx.body = {error: 'path required'}
            return
        }
        const result = await sessionManager.associateApp({
            username,
            sessionId: ctx.params.sessionId,
            appPath: path,
            label,
            clientId,
            reassert: reassert === true,
        })
        ctx.status = 201
        ctx.body = result
    }

    // DELETE /sessions/app?path=…&clientId=… → 204. Unbinds the app from its session (GUI
    // tab close, or a takeover): the session stays open, only the association is removed.
    // Idempotent. clientId (optional) identifies the REQUESTING client, so the dissociation
    // event can tell the association's owner apart from whoever removed it.
    const dissociateApp = async ctx => {
        const {username} = selfUser(ctx)
        const path = ctx.query?.path
        if (!path) {
            ctx.status = 400
            ctx.body = {error: 'path required'}
            return
        }
        await sessionManager.dissociateApp({username, appPath: path, requestingClientId: ctx.query?.clientId})
        ctx.status = 204
    }

    // POST /sessions/session/:sessionId/server/:endpoint → 204. Resolves only once the
    // endpoint's server is listening, so the caller can proxy straight afterwards.
    const startServer = async ctx => {
        const {username} = selfUser(ctx)
        await sandboxServers.ensureServerStarted({
            username,
            sessionId: ctx.params.sessionId,
            endpoint: ctx.params.endpoint,
        })
        ctx.status = 204
    }

    // GET /sessions/app-sessions → the user's app associations on open sessions.
    // Raw states are mapped to the REST status vocabulary ('STARTING' | 'ACTIVE').
    const appSessions = async ctx => {
        const {username} = selfUser(ctx)
        const appSessionList = await sessionManager.userAppSessions(username)
        ctx.body = appSessionList.map(({status, ...rest}) => ({
            ...rest,
            status: status === 'PENDING' ? 'STARTING' : 'ACTIVE',
        }))
    }

    // ── all open sessions (admin; budget module boot seed + hourly reconciler) ──────────────────
    // Every currently-open (PENDING+ACTIVE) session across ALL users — not scoped to the
    // requesting/current user. Response shape: [{username, sessionId, instanceType, creationTime}].
    const openSessions = async ctx => {
        ctx.body = await sessionManager.allOpenSessions()
    }

    const mostRecentlyClosed = async ctx => {
        // This route has NO :username path segment, so the username comes from the query string
        // (?username=...). 400 if absent.
        const username = ctx.query.username
        if (!username) {
            ctx.status = 400
            ctx.body = {error: 'username required'}
            return
        }
        ctx.body = await sessionManager.mostRecentlyClosedSession(username)
    }

    // ── request session ──────────────────────────────────────────────────────
    // Launch failures a user can act on (AWS capacity / account quota) answer 503 with a
    // machine-readable code — ssh-gateway maps it to a specific message with retry options.
    const requestSession = resolve => async ctx => {
        const {username, forCurrentUser} = resolve(ctx)
        const instanceType = ctx.params.instanceType
        try {
            const session = await sessionManager.requestSession({instanceType, workerType: SANDBOX, username})
            ctx.status = 201
            ctx.body = sessionResponse(session, username, forCurrentUser)
        } catch (error) {
            const code = launchFailureCode(error)
            if (!code) {
                throw error
            }
            ctx.status = 503
            ctx.body = {code, message: error.message}
        }
    }

    // ── heartbeat ──────────────────────────────────────────────────────────────
    const heartbeat = resolve => async ctx => {
        const {username, forCurrentUser} = resolve(ctx)
        const session = await sessionManager.heartbeat({
            sessionId: ctx.params.sessionId,
            username,
            // Explicit-true only. A bare beat extends NOTHING — the gateway beats for every
            // cached session whether or not anyone is using it, and reading that as liveness is
            // exactly what kept forgotten tabs alive indefinitely.
            interaction: ctx.request.body?.interaction === true,
        })
        ctx.body = sessionResponse(session, username, forCurrentUser)
    }

    // ── keep-alive (self only) ──────────────────────────────────────────────────
    // The Usage-panel slider. REPLACES the deadline — the one write that may also shorten it.
    const setKeepAlive = async ctx => {
        const {username} = selfUser(ctx)
        const hoursRaw = ctx.query.hours ?? ctx.request.body?.hours
        const hours = Number(hoursRaw)
        if (hoursRaw == null || hoursRaw === '' || !Number.isFinite(hours)) {
            ctx.status = 400
            ctx.body = {error: 'hours required'}
            return
        }
        await sessionManager.setSessionTimeoutHours({sessionId: ctx.params.sessionId, hours, username})
        ctx.status = 204
    }

    // The in-app Extend button on the expiry notification. Acknowledged rather than fire-and-
    // forget: it is a one-shot with no successor to re-assert it, and a button that appears to
    // work while doing nothing is the worst outcome available.
    const extendNow = async ctx => {
        const {username} = selfUser(ctx)
        const extended = await sessionManager.manualExtension({sessionId: ctx.params.sessionId, username})
        ctx.status = extended ? 200 : 409
        ctx.body = {extended}
    }

    // App or terminal opened — the one-shot that gives a freshly opened thing its own lease.
    const openExtension = async ctx => {
        const {username} = selfUser(ctx)
        const extended = await sessionManager.openExtension({sessionId: ctx.params.sessionId, username})
        ctx.status = extended ? 200 : 409
        ctx.body = {extended}
    }

    // Dismiss — "I saw it, don't email me", and nothing more. The session still closes at
    // T+grace: an easy misclick must not be read as consent to close early.
    const dismissExpiry = async ctx => {
        const {username} = selfUser(ctx)
        await sessionManager.dismissExpiryNotification({sessionId: ctx.params.sessionId, username})
        ctx.status = 204
    }

    // ── email management link (UNAUTHENTICATED — the token carries its own authority) ──────────
    // The mail carries ONE link. The GET renders the page offering both choices and MUST NOT
    // mutate anything: mail-client link scanners, corporate URL-rewriting proxies and preview
    // fetchers all fire it, so a mutating GET would act for users who never opened the mail and
    // spend the token before the real click arrived — and for terminate that means destroying an
    // instance nobody asked to destroy. Each button on the page POSTs back the same token plus
    // the action it stands for.
    const REDEEM = {
        extend: {
            redeem: claim => sessionManager.redeemExtension(claim),
            done: extendedPage,
        },
        terminate: {
            redeem: claim => sessionManager.redeemTermination(claim),
            done: terminatedPage,
        },
    }

    const manageBody = description => managePage(expiryPolicy.emailExtensionMinutes, description)

    const describe = sessionId =>
        sessionManager.instanceDescription
            ? sessionManager.instanceDescription(sessionId)
            : null

    const expiryPage = async ctx => {
        const claim = expiryTokens?.verify(ctx.params.token, clock())
        ctx.type = 'html'
        ctx.body = claim ? manageBody(await describe(claim.sessionId)) : expiredPage()
    }

    const redeemExpiryToken = async ctx => {
        const claim = expiryTokens?.verify(ctx.params.token, clock())
        ctx.type = 'html'
        if (!claim) {
            ctx.status = 410
            ctx.body = expiredPage()
            return
        }
        // Read BEFORE the action: the ordinal is a position among OPEN sessions, so terminating
        // this one renumbers the rest and the result page would name a different machine.
        const description = await describe(claim.sessionId)
        // No action, or one this server does not implement: do NOTHING and offer the choice again.
        // Guessing a default would eventually guess `terminate` for someone who never asked.
        const chosen = REDEEM[ctx.request.body?.action]
        if (!chosen) {
            ctx.status = 400
            ctx.body = manageBody(description)
            return
        }
        const redeemed = await chosen.redeem({
            sessionId: claim.sessionId, notifiedTime: claim.notifiedTime,
        })
        // Someone clicked a link in an email and needs to be told what happened — a bare error
        // would leave them guessing what became of their instance.
        ctx.body = redeemed ? chosen.done(description) : expiredPage()
    }

    // ── close session ──────────────────────────────────────────────────────────
    const closeSession = resolve => async ctx => {
        const {username} = resolve(ctx)
        await sessionManager.closeSession({sessionId: ctx.params.sessionId, username})
        ctx.status = 204
        ctx.body = {status: 'OK'}
    }

    // ── close all sessions of a user (admin) ────────────────────────────────────
    const closeUserSessions = async ctx => {
        const {username} = pathUser(ctx)
        await sessionManager.closeUserSessions(username)
        ctx.status = 204
        ctx.body = {status: 'OK'}
    }

    // ── api-key authenticate (admin) ────────────────────────────────────────────
    const apiKeyAuthenticate = async ctx => {
        const apiKey = ctx.request.body?.apiKey ?? ctx.query.apiKey
        if (!apiKey) {
            ctx.status = 400
            ctx.body = {error: 'apiKey required'}
            return
        }
        const username = await sessionManager.findUsernameByApiKey(apiKey)
        if (!username) {
            ctx.status = 401
            ctx.body = {}
            return
        }
        ctx.body = {username}
    }

    return {
        selfUser,
        pathUser,
        // report
        generateReportSelf: generateReport(selfUser),
        generateReportOther: generateReport(pathUser),
        userUsage,
        userSessions,
        mostRecentlyClosedByUser,
        mostRecentlyClosed,
        // active/pending sandbox sessions (gateway cache-miss fallback)
        activeSessions,
        // app ↔ session association
        associateApp,
        dissociateApp,
        appSessions,
        startServer,
        // all open sessions (admin; budget module boot seed + hourly reconciler)
        openSessions,
        // request
        requestSessionSelf: requestSession(selfUser),
        requestSessionOther: requestSession(pathUser),
        // heartbeat
        heartbeatSelf: heartbeat(selfUser),
        heartbeatOther: heartbeat(pathUser),
        // deadline
        setKeepAlive,
        extendNow,
        openExtension,
        dismissExpiry,
        expiryPage,
        redeemExpiryToken,
        // close
        closeSessionSelf: closeSession(selfUser),
        closeSessionOther: closeSession(pathUser),
        closeUserSessions,
        // api-key
        apiKeyAuthenticate,
        _internal: {reportAsMap, sessionResponse, round2},
    }
}

export {createSessionsApi}
