// workerSession/index.js — session component lifecycle wiring. Owns the session schedulers;
// NOT the command/query surface (sessionManager.js) nor the REST surface (sessionsApi.js).
//
// Scheduling (fixed-delay, initial run immediate — except CloseTimedOutSessions and
// ExpireSessions, which stay inert for STARTUP_GRACE_MS so a worker outage does not close every
// open session on restart):
//   @1min:  CloseTimedOutSessions, ExpireSessions, CloseSessionsWithoutInstance,
//           ReleaseUnusedInstances(5, MINUTES)
//   @12min: RemoveOrphanedTmpDirs, RemoveOrphanedContainers (local-daemon container sweep;
//           the first run is immediate, so a worker restart cleans up at startup)
//   @5min:  RefreshGoogleTokens
//
// Closing the sessions of an over-budget user is event-driven, not scheduled: main.js's
// budget.UserBudgetExceeded subscriber calls lockedUsers.onExceeded(...), which on a NEW lock
// fire-and-forgets closeUserSessions. See ../lockedUsers.js.
//
// RemoveOrphanedTmpDirs + RefreshGoogleTokens are NOT bound on sessionManager (they need the
// googleOAuthGateway / homeDir collaborators, which are lifecycle concerns) — this component
// binds them directly to their handlers.
//
// The user.UserLocked subscription is exposed as `userSubscriber` — a {queue, topic, handler}
// that main.js passes into initMessageQueue's subscribers (the message queue is owned by main.js).
//
// DO NOT auto-start on import. main.js calls start() explicitly.

import {getLogger} from '#sepal/log'

import {createScheduler} from '../scheduler.js'
import {userTag} from '../tag.js'
import {MINUTE_MS} from '../time.js'
import {refreshGoogleTokens as _refreshGoogleTokens} from './command/refreshGoogleTokens.js'
import {removeOrphanedTmpDirs as _removeOrphanedTmpDirs} from './command/removeOrphanedTmpDirs.js'
import {WORKER_SESSION_PUBLISHERS} from './events.js'
import {createMissingInstanceTracker} from './missingInstanceTracker.js'

const log = getLogger('worker/workerSession')

const RELEASE_UNUSED_MIN_AGE_MINUTES = 5

// STARTUP_GRACE_MS — how long after startup the closing sweeps stay inert. A stored deadline is
// not destroyed by a worker outage, but the SENDERS of extension events cannot reach a down
// worker, so after an outage they need wall-clock time to re-assert what is still alive. It
// suppresses the sweep rather than shifting deadlines. The cost of being wrong is that a genuinely
// dead session survives two extra minutes.
//
// Measured from process start, which is exactly what leaves the crash-loop gap open: a worker
// restarting more often than this reaches no sweep and closes nothing (see
// docs/session-expiration-model.md §8 — the durable deadline does NOT fix that, and closing a
// crash-loop gap needs a grace satisfiable across restarts).
const STARTUP_GRACE_MS = 2 * MINUTE_MS

const createSessionComponent = ({
    sessionManager,
    repo,
    googleOAuthGateway,
    instanceManager,
    homeDir,
    clock = () => new Date(),
}) => {
    // Handlers not bound on sessionManager (lifecycle-only collaborators).
    const removeOrphanedTmpDirs = () => _removeOrphanedTmpDirs({repo, ...(homeDir ? {homeDir} : {})})
    const refreshGoogleTokens = () => _refreshGoogleTokens({repo, googleOAuthGateway})

    const scheduler = createScheduler(log)

    const start = () => {
        log.debug('Starting...')

        // In-proc instance → session seam (onInstanceActivated / onFailedToProvisionInstance).
        sessionManager.registerInstanceManagerHooks(instanceManager)

        const startTime = clock()

        // @1min: close timed-out + without-instance sessions; release unused instances.
        scheduler.schedule(
            'CloseTimedOutSessions',
            () => sessionManager.closeTimedOutSessions({startTime, startupGraceMs: STARTUP_GRACE_MS}),
            MINUTE_MS)
        // The tracker lives for the component's lifetime: it is what turns a per-sweep probe
        // verdict into a decision, so it must survive across sweeps (and only across them — a
        // restart starting from a clean slate is the safe direction).
        const missingInstanceTracker = createMissingInstanceTracker({clock})
        scheduler.schedule(
            'CloseSessionsWithoutInstance',
            () => sessionManager.closeSessionsWithoutInstance(missingInstanceTracker),
            MINUTE_MS)
        scheduler.schedule(
            'ReleaseUnusedInstances',
            () => sessionManager.releaseUnusedInstances(RELEASE_UNUSED_MIN_AGE_MINUTES, 'MINUTES'),
            MINUTE_MS)

        // @1min: the expiry sweep — notify → email → close over stored deadlines. It is a no-op
        // under SESSION_EXPIRY_MODE=off, but the ratchets that feed it run regardless, so mode=off
        // still records what would have been decided.
        scheduler.schedule(
            'ExpireSessions',
            () => sessionManager.expireSessions({startTime, startupGraceMs: STARTUP_GRACE_MS}),
            MINUTE_MS)

        // @12min: remove orphaned tmp dirs + orphaned containers on the shared local daemon.
        scheduler.schedule('RemoveOrphanedTmpDirs', removeOrphanedTmpDirs, 12 * MINUTE_MS)
        scheduler.schedule(
            'RemoveOrphanedContainers', () => sessionManager.removeOrphanedContainers(), 12 * MINUTE_MS)

        // @5min: refresh Google tokens.
        scheduler.schedule('RefreshGoogleTokens', refreshGoogleTokens, 5 * MINUTE_MS)

        log.info('Started')
    }

    const stop = () => {
        log.debug('Stopping...')
        scheduler.stopAll()
        log.info('Stopped')
    }

    // user.UserLocked subscriber. Queue `workersession.user`, bound to `user.*` on sepal.topic.
    // On `user.UserLocked` → close all of that user's sessions. Other user.* keys are ignored.
    const userSubscriber = {
        queue: 'workersession.user',
        topic: 'user.*',
        handler: async (key, message) => {
            if (key === 'user.UserLocked') {
                const username = message?.username
                if (username) {
                    log.debug(`Closing sessions for ${userTag(username)} (user.UserLocked)`)
                    await sessionManager.closeUserSessions(username)
                }
            }
        },
    }

    return {
        start,
        stop,
        userSubscriber,
        WORKER_SESSION_PUBLISHERS,
    }
}

export {createSessionComponent}
