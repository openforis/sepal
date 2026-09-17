// workerSession/index.js — session component lifecycle wiring. Owns the session schedulers;
// NOT the command/query surface (sessionManager.js) nor the REST surface (sessionsApi.js).
//
// Scheduling (fixed-delay, initial run immediate):
//   @1min:  ReconcilePendingSessions → CloseTimedOutSessions (one job, in that order),
//           ExpireSessions, CloseSessionsWithoutInstance, ReleaseUnusedInstances(5, MINUTES),
//           ReclaimStaleClaims
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

// RequestSession inserts the session row only after RequestInstance returns, so a claim
// legitimately has no session behind it for as long as awaitHost runs: 300 iterations of a 1s
// sleep PLUS a DescribeInstances round trip each, typically 5-6 minutes and able to exceed this
// grace outright when the SDK is backing off. The margin is slim, not generous.
const CLAIM_GRACE_MS = 10 * MINUTE_MS

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

        // @1min: the PENDING sessions — recover first, then kill what is still hanging. One job
        // rather than two, so a restart activates a session whose instance came up while the
        // worker was down before the timed-out sweep can see it. Sequencing replaces the old
        // startup grace: the recovery does not need wall-clock time, and a grace measured from
        // process start was starved by any crash loop faster than it.
        scheduler.schedule(
            'ReconcilePendingSessions',
            async () => {
                await sessionManager.reconcilePendingSessions()
                await sessionManager.closeTimedOutSessions()
            },
            MINUTE_MS)
        // @1min: close without-instance sessions; release unused instances.
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
        scheduler.schedule(
            'ReclaimStaleClaims',
            () => sessionManager.reclaimStaleClaims(CLAIM_GRACE_MS),
            MINUTE_MS)
        // @1min: the expiry sweep — notify → email → close over stored deadlines. It is a no-op
        // under SESSION_EXPIRY_MODE=off, but the ratchets that feed it run regardless, so mode=off
        // still records what would have been decided. Not held back after a restart: a deadline
        // that passed during an outage earns a notification and the full grace, never a close.
        scheduler.schedule(
            'ExpireSessions',
            () => sessionManager.expireSessions(),
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
