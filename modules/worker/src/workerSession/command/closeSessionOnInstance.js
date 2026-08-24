// Triggered in-proc by InstanceManager.onFailedToProvisionInstance: find the PENDING|ACTIVE
// session on the instance and, if there is one, delegate to CloseSession (reusing its two-step
// close).

import {getLogger} from '#sepal/log'

import {instanceTag, sessionTag} from '../../tag.js'
import {State} from '../workerSession.js'
import {closeSession} from './closeSession.js'

const log = getLogger('worker/closeSessionOnInstance')

const closeSessionOnInstance = async (instanceId, {repo, instanceManager, emitWorkerSessionClosed}) => {
    const session = await repo.sessionOnInstance(instanceId, [State.PENDING, State.ACTIVE])
    if (session) {
        log.debug(`Closing ${sessionTag(session)} on ${instanceTag(instanceId)}...`)
        await closeSession({sessionId: session.id}, {repo, instanceManager, emitWorkerSessionClosed})
    }
    return null
}

export {closeSessionOnInstance}
