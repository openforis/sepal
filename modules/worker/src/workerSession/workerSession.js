// WorkerSession domain.
//
// Sessions are immutable: the mutators (activate/close/withInstance/…) return NEW objects.
//
// Shape (the persisted columns + the derived instance object):
//   id                    — session id
//   state                 — PENDING | ACTIVE | CLOSED
//   username              — owner
//   workerType            — SANDBOX | TASK_EXECUTOR
//   instanceType          — instance type id
//   instance              — { id, host } (maps to the instance_id / host columns)
//   host                  — convenience copy of instance.host (kept in sync by the factory/mutators)
//   creationTime          — Date
//   updateTime            — Date (audit only; it no longer decides an ACTIVE session's lifetime)
//   timeoutTime           — Date | null (the deadline; the only thing that decides lifetime)
//   lastInteractionTime   — Date | null (last HUMAN interaction; anchors the unattended cap)
//   activeTime            — Date | null (PENDING → ACTIVE; the cap's fallback anchor)
//   notificationState     — 'NONE' | 'NOTIFIED' | 'DISMISSED' | 'EMAILED'
//   notifiedTime          — Date | null (anchors the email escalation and the grace clock)
//   apiKey                — credential; NEVER serialise (stripped from events / responses)

import crypto from 'crypto'

const State = Object.freeze({
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    CLOSED: 'CLOSED',
})

// The expiry-notification cycle. Any extension resets it to NONE (see the repository's ratchet),
// which is what makes "any extension cancels the expiry" a guarantee rather than a race.
const NotificationState = Object.freeze({
    NONE: 'NONE',
    NOTIFIED: 'NOTIFIED',
    DISMISSED: 'DISMISSED',
    EMAILED: 'EMAILED',
})

// `instance` is the { id, host } object; `host` is a top-level convenience field that tracks
// instance.host.

const createWorkerSession = ({
    id,
    state,
    username,
    workerType,
    instanceType,
    instance = {id: null, host: null},
    creationTime = null,
    updateTime = null,
    timeoutTime = null,
    lastInteractionTime = null,
    activeTime = null,
    notificationState = NotificationState.NONE,
    notifiedTime = null,
    apiKey = null,
}) => Object.freeze({
    id,
    state,
    username,
    workerType,
    instanceType,
    instance: Object.freeze({id: instance?.id ?? null, host: instance?.host ?? null}),
    host: instance?.host ?? null,
    creationTime,
    updateTime,
    timeoutTime,
    lastInteractionTime,
    activeTime,
    notificationState,
    notifiedTime,
    apiKey,
})

const isPending = session => session.state === State.PENDING
const isActive = session => session.state === State.ACTIVE
const isClosed = session => session.state === State.CLOSED

// Mutators — return NEW frozen sessions.

const update = (session, state) => createWorkerSession({...session, state})

const activate = session => update(session, State.ACTIVE)

const close = session => update(session, State.CLOSED)

const withInstance = (session, instance) => createWorkerSession({...session, instance})

const withApiKey = (session, apiKey) => createWorkerSession({...session, apiKey})

// Timeout — PENDING only. A PENDING session still dies 10 minutes after it was created
// (update_time is never refreshed before ACTIVE), because a hung provision should die in ten
// minutes, not thirty. An ACTIVE session's lifetime is the stored timeout_time.
//   lastValidUpdate(date) = date − 10min      (the oldest update_time that is still "fresh")
//   willTimeout(date)     = date + 10min + 1ms

const TEN_MINUTES_MS = 10 * 60 * 1000

const makeTimeout = timeoutInMillis => Object.freeze({
    timeoutInMillis,
    get: now => new Date(now.getTime() - timeoutInMillis),
    lastValidUpdate: date => new Date(date.getTime() - timeoutInMillis),
    willTimeout: date => new Date(date.getTime() + timeoutInMillis + 1),
})

const Timeout = Object.freeze({
    PENDING: makeTimeout(TEN_MINUTES_MS),
})

// ApiKeyGenerator — 32 random bytes as URL-safe Base64 without padding (Node's base64url).

const createApiKeyGenerator = () => ({
    generate: () => crypto.randomBytes(32).toString('base64url'),
})

export {
    activate,
    close,
    createApiKeyGenerator,
    createWorkerSession,
    isActive,
    isClosed,
    isPending,
    NotificationState,
    State,
    Timeout,
    update,
    withApiKey,
    withInstance,
}
