// workerSession events.
//
// Each event is published to BOTH:
//   1. the sepal.topic RabbitMQ exchange (via an RxJS Subject → publisher stream wired in main.js)
//   2. an in-proc Node.js EventEmitter — the task component consumes these in-proc.
//
// Routing keys: workerSession.{EventName}
//
// Payloads:
//   WorkerSessionRequested  { username, session }   (session has its api_key STRIPPED)
//   WorkerSessionActivated  { username, session }   (session has its api_key STRIPPED)
//   WorkerSessionClosed     { username, sessionId }

import EventEmitter from 'events'
import {Subject} from 'rxjs'

import {getLogger} from '#sepal/log'

import {sessionTag} from '../tag.js'

const log = getLogger('worker/sessionEvents')

// ─── In-proc EventEmitter ────────────────────────────────────────────────────
// Consumed in-proc by the task component.
const workerSessionEvents = new EventEmitter()
workerSessionEvents.setMaxListeners(50)

// ─── RxJS Subjects (→ sepal.topic publishers) ────────────────────────────────
const workerSessionRequested$ = new Subject()
const workerSessionActivated$ = new Subject()
const workerSessionClosed$ = new Subject()
const sessionAppAssociated$ = new Subject()
const sessionAppDissociated$ = new Subject()
const sessionExpiryNotified$ = new Subject()
const sessionExpiryClosed$ = new Subject()

// ─── sessionChanged$ — INTERNAL, not published to RabbitMQ ───────────────────
// Fires {username} whenever anything visible in that user's session REPORT changed, so the
// session ws (./ws.js) can re-query and push. Fanned from the three published events below plus
// two mutations that have no published event of their own (session requested — a new PENDING row;
// extendSession — moves the deadline the Usage panel shows); those two are emitted by
// sessionManager.
//
// NOT fed by heartbeat: it fires constantly and only touches updateTime, which is not part of the
// report payload — pushing on it would reinstate the polling load we are removing.
const sessionChanged$ = new Subject()

const emitSessionChanged = ({username}) => {
    if (username) {
        sessionChanged$.next({username})
    }
}

// ─── Emit helpers ────────────────────────────────────────────────────────────
// Each helper publishes to the Subject (→ RabbitMQ) AND fires the in-proc emitter.

// emitWorkerSessionRequested({username, session}) — a new PENDING row exists. Budget opens the
// instance-use row on it, so a session is billed from its creationTime even if it is closed
// before it ever activates. The session MUST already have its api_key stripped by the caller.
const emitWorkerSessionRequested = ({username, session}) => {
    const payload = {username, session}
    log.debug(`Emitting WorkerSessionRequested ${sessionTag(session)}`)
    workerSessionRequested$.next(payload)
    workerSessionEvents.emit('WorkerSessionRequested', payload)
}

// emitWorkerSessionActivated({username, session}) — the session MUST already have its api_key
// stripped by the caller (ActivatePendingSessionOnInstance does session.withApiKey(null)).
const emitWorkerSessionActivated = ({username, session}) => {
    const payload = {username, session}
    log.debug(`Emitting WorkerSessionActivated ${sessionTag(session)}`)
    workerSessionActivated$.next(payload)
    workerSessionEvents.emit('WorkerSessionActivated', payload)
    emitSessionChanged({username})
}

const emitWorkerSessionClosed = ({username, sessionId}) => {
    const payload = {username, sessionId}
    log.debug(`Emitting WorkerSessionClosed ${sessionTag(sessionId)}`)
    workerSessionClosed$.next(payload)
    workerSessionEvents.emit('WorkerSessionClosed', payload)
    emitSessionChanged({username})
}

// emitSessionAppAssociated — an app was STARTED on a session (association created).
// Under the workerSession.* prefix so per-user live consumers (ssh-gateway's exclusive
// wildcard queue) refresh without extra bindings.
const emitSessionAppAssociated = ({username, sessionId, path, label}) => {
    const payload = {username, sessionId, path, label}
    log.debug(`Emitting SessionAppAssociated ${sessionTag(sessionId)} ${path}`)
    sessionAppAssociated$.next(payload)
    workerSessionEvents.emit('SessionAppAssociated', payload)
    emitSessionChanged({username})
}

// emitSessionAppDissociated — an app was unbound from its session (tab close, clientDown
// sweep, or a takeover from another browser). The session stays open; the association's
// removal on session close is instead announced by WorkerSessionClosed (the cascade).
// clientId = the association's OWNER (nullable); requestingClientId = the client whose
// request caused the dissociation (absent for the clientDown sweep). The gateway notifies
// the owner to close its tab when owner ≠ requester — that is the takeover close.
const emitSessionAppDissociated = ({username, sessionId, path, clientId, requestingClientId}) => {
    const payload = {username, sessionId, path, clientId: clientId ?? null, requestingClientId: requestingClientId ?? null}
    log.debug(`Emitting SessionAppDissociated ${sessionTag(sessionId)} ${path}`)
    sessionAppDissociated$.next(payload)
    workerSessionEvents.emit('SessionAppDissociated', payload)
    emitSessionChanged({username})
}

// emitSessionExpiryNotified — the session reached its deadline and the user is being warned.
// The caller MUST pass an apiKey-stripped session (withApiKey(session, null)).
//
// apps/terminals/ordinal describe what is running and what the user calls the instance, so the
// notification can name it the way the SSH menu does rather than quoting a UUID. Captured before
// anything closes — the close cascade deletes the app associations.
//
// extensionMinutes is what the in-app Extend button will actually buy, so the button can say so
// instead of the GUI guessing at a duration this process configures.
const emitSessionExpiryNotified = ({username, session, apps = [], terminals = 0, ordinal = null, instanceName = null, extensionMinutes = null}) => {
    const payload = {username, sessionId: session.id, session, apps, terminals, ordinal, instanceName, extensionMinutes}
    log.debug(`Emitting SessionExpiryNotified ${sessionTag(session)}`)
    sessionExpiryNotified$.next(payload)
    workerSessionEvents.emit('SessionExpiryNotified', payload)
    emitSessionChanged({username})
}

// emitSessionExpiryClosed — the grace period ran out and the session was closed.
// Fired IN ADDITION to WorkerSessionClosed (which the close cascade emits) to say WHY, and with
// what was closed, so the GUI can replace its warning with an accurate past-tense message.
const emitSessionExpiryClosed = ({username, sessionId, apps = [], terminals = 0, ordinal = null, instanceName = null}) => {
    const payload = {username, sessionId, apps, terminals, ordinal, instanceName}
    log.debug(`Emitting SessionExpiryClosed ${sessionTag(sessionId)}`)
    sessionExpiryClosed$.next(payload)
    workerSessionEvents.emit('SessionExpiryClosed', payload)
    emitSessionChanged({username})
}

// ─── Publisher map for initMessageQueue ──────────────────────────────────────
const WORKER_SESSION_PUBLISHERS = [
    {key: 'workerSession.WorkerSessionRequested', publish$: workerSessionRequested$},
    {key: 'workerSession.WorkerSessionActivated', publish$: workerSessionActivated$},
    {key: 'workerSession.WorkerSessionClosed', publish$: workerSessionClosed$},
    {key: 'workerSession.SessionAppAssociated', publish$: sessionAppAssociated$},
    {key: 'workerSession.SessionAppDissociated', publish$: sessionAppDissociated$},
    {key: 'workerSession.SessionExpiryNotified', publish$: sessionExpiryNotified$},
    {key: 'workerSession.SessionExpiryClosed', publish$: sessionExpiryClosed$},
]

export {
    emitSessionAppAssociated,
    emitSessionAppDissociated,
    emitSessionChanged,
    emitSessionExpiryClosed,
    emitSessionExpiryNotified,
    emitWorkerSessionActivated,
    emitWorkerSessionClosed,
    emitWorkerSessionRequested,
    sessionChanged$,
    WORKER_SESSION_PUBLISHERS,
    workerSessionActivated$,
    workerSessionClosed$,
    workerSessionEvents,
    workerSessionRequested$,
}
