// ReconcilePendingSessions — the recovery sweep for sessions whose provisioning nobody is
// finishing.
//
// Provisioning is driven by the in-proc InstancePendingProvisioning event, so a worker that
// restarts mid-provision — or between a successful provision and the activation it triggers —
// leaves the session PENDING with nobody to move it. CloseTimedOutSessions then kills it ten
// minutes later, even when its instance is up and fully provisioned.
//
// Per PENDING session, on the same probe CloseSessionsWithoutInstance uses:
//   PROVISIONED — the containers are there; activate. The repository's guarded PENDING → ACTIVE
//                 update keeps that single-shot however many callers race for it.
//   MISSING     — re-provision. Success emits InstanceProvisioned, so the session is still
//                 activated through the one existing hook rather than a second path.
//   UNKNOWN     — nothing. An inconclusive probe is not evidence, and CloseTimedOutSessions
//                 stays the backstop for a session that never becomes probeable.
//
// It never closes a session, which is why it is NOT gated on the startup grace: a restart is
// exactly when it needs to run.
//
// An instance already being provisioned in this process is skipped — provisionInstance opens by
// deleting the instance's containers, so re-entering it would destroy the work in flight.

import {getLogger} from '#sepal/log'

import {sessionTag} from '../../tag.js'
import {InstanceStatus} from '../../workerInstance/instanceStatus.js'
import {State} from '../workerSession.js'

const log = getLogger('worker/reconcilePendingSessions')

const reconcilePendingSessions = async ({repo, instanceManager, activatePendingSessionOnInstance}) => {
    const sessions = (await repo.sessions([State.PENDING])).filter(s => s.instance && s.instance.id)
    if (sessions.length === 0) {
        return null
    }

    const unconfirmed = await instanceManager.sessionsWithoutInstance(sessions)
    const statusBySessionId = new Map(unconfirmed.map(({session, status}) => [session.id, status]))

    for (const session of sessions) {
        if (instanceManager.isProvisioning(session.instance.id)) {
            continue
        }
        // Absent from the unconfirmed list = the probe confirmed the containers are there.
        const status = statusBySessionId.get(session.id) ?? InstanceStatus.PROVISIONED
        if (status === InstanceStatus.PROVISIONED) {
            try {
                await activatePendingSessionOnInstance(session.instance.id)
                log.info(`Activated ${sessionTag(session)} - its provisioning outlived the worker that started it`)
            } catch (error) {
                log.error(`Failed to activate ${sessionTag(session)}`, error)
            }
        } else if (status === InstanceStatus.MISSING) {
            // Deliberately NOT awaited: provisionInstance retries for up to seventeen minutes,
            // which would stall the sweep well past its own one-minute interval. The registry
            // guard above is what keeps the next sweep from starting a second one.
            log.warn(`Re-provisioning ${sessionTag(session)} - no containers on its instance`)
            instanceManager.reprovisionInstance(session).catch(error =>
                log.error(`Failed to re-provision ${sessionTag(session)}`, error)
            )
        }
    }
    return null
}

export {reconcilePendingSessions}
