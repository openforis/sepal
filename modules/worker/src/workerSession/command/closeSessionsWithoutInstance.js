// Loads ACTIVE sessions, probes each one's instance, and closes those the probe has condemned.
// Deliberately does NOT call releaseInstance — the instance is already gone, so this only updates
// the row to CLOSED and publishes WorkerSessionClosed. Each close is isolated (one failure must
// not abort the rest).
//
// A probe result on its own never closes anything. It is fed to the tracker, which requires a
// confirmed MISSING (Docker denying the containers, twice running) before conceding that the
// instance is gone, and treats an inconclusive UNKNOWN as no evidence at all — see
// ../missingInstanceTracker.js. Closing a session is destructive and asymmetric: the instance is
// released and terminated 5 minutes later by ReleaseUnusedInstances, killing the user's running
// processes, while the cost of waiting one more sweep is one minute of a dead instance.

import {getLogger} from '#sepal/log'

import {sessionTag} from '../../tag.js'
import {InstanceStatus} from '../../workerInstance/instanceStatus.js'
import {close, State} from '../workerSession.js'

const log = getLogger('worker/closeSessionsWithoutInstance')

const closeSessionsWithoutInstance = async ({repo, instanceManager, emitWorkerSessionClosed, tracker}) => {
    const sessions = await repo.sessions([State.ACTIVE])
    const unconfirmed = await instanceManager.sessionsWithoutInstance(sessions)
    const statusBySessionId = new Map(unconfirmed.map(({session, status}) => [session.id, status]))

    for (const session of sessions) {
        // Absent from the unconfirmed list = the probe confirmed the instance is there.
        const status = statusBySessionId.get(session.id) ?? InstanceStatus.PROVISIONED
        if (!tracker.record(session.id, status)) {
            continue
        }
        if (status === InstanceStatus.UNKNOWN) {
            log.warn(`${sessionTag(session)} has gone unprobeable for the whole backstop window - closing anyway`)
        }
        try {
            await repo.update(close(session))
            emitWorkerSessionClosed({username: session.username, sessionId: session.id})
            log.info(`Closed ${sessionTag(session)} - instance ${status}`)
        } catch (error) {
            log.error(`Failed to close instance-less ${sessionTag(session)}`, error)
        }
    }

    tracker.retain(sessions.map(({id}) => id))
    return null
}

export {closeSessionsWithoutInstance}
