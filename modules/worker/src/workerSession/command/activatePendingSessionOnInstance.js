// Triggered in-proc by InstanceManager.onInstanceActivated (the InstanceProvisioned event):
//   - find the PENDING session on the instance (repo.sessionOnInstance(id, [PENDING]))
//   - if none → no-op
//   - repo.activateSession — guarded PENDING → ACTIVE, stamping active_time and re-ratcheting the
//     startup lease from activation (provisioning time must not eat into it)
//   - emit WorkerSessionActivated {username, session WITH api_key STRIPPED}
//
// The guard also makes the emission single-shot: only the caller whose UPDATE changed a row
// announces the activation.

import {getLogger} from '#sepal/log'

import {instanceTag, sessionTag} from '../../tag.js'
import {State, withApiKey} from '../workerSession.js'

const log = getLogger('worker/activatePendingSessionOnInstance')

const activatePendingSessionOnInstance = async (instanceId, {repo, startupLeaseMinutes, emitWorkerSessionActivated}) => {
    const session = await repo.sessionOnInstance(instanceId, [State.PENDING])
    if (!session) {
        return null // no pending session on this instance
    }
    const activatedSession = await repo.activateSession(session.id, startupLeaseMinutes)
    if (!activatedSession) {
        return null // another caller won the transition
    }
    // Strip apiKey before publishing — the event is serialised to RabbitMQ.
    emitWorkerSessionActivated({
        username: activatedSession.username,
        session: withApiKey(activatedSession, null),
    })
    log.info(`Activated ${sessionTag(activatedSession)} on ${instanceTag(instanceId)}`)
    return null
}

export {activatePendingSessionOnInstance}
