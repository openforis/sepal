// CloseSession runs as TWO SEPARATE TRANSACTIONS (do NOT merge):
//   step 1: repo.update(session.close())   → state=CLOSED
//   step 2: release the instance, then revoke the api key (./releaseSessionInstance.js)
//   then:   emit WorkerSessionClosed {username, sessionId}
// The row-close must commit before the instance release runs.
//
// Ownership check: if command.username is set AND != session.username → throw Unauthorized.
// Guard: if session state not in [PENDING, ACTIVE] → no-op return (already closed / bad state).

import {getLogger} from '#sepal/log'

import {sessionTag} from '../../tag.js'
import {close, isActive, isPending} from '../workerSession.js'
import {releaseSessionInstance} from './releaseSessionInstance.js'

const log = getLogger('worker/closeSession')

class Unauthorized extends Error {
    constructor(message) {
        super(message)
        this.name = 'Unauthorized'
    }
}

// username — optional owner check (null/undefined = system/admin, which skips the check).
const closeSession = async ({sessionId, username}, {repo, instanceManager, emitWorkerSessionClosed}) => {
    const session = await repo.getSession(sessionId)
    if (username && username !== session.username) {
        throw new Unauthorized(`Session not owned by user: ${session.id}`)
    }
    if (!isActive(session) && !isPending(session)) {
        return null // already closed / not closeable — no-op (Groovy parity)
    }
    // step 1 — close the row (separate transaction)
    await repo.update(close(session))
    // step 2 — release the instance (separate transaction)
    await releaseSessionInstance(
        {sessionId: session.id, instanceId: session.instance.id},
        {repo, releaseInstance: instanceManager.releaseInstance}
    )
    // publish AFTER both steps
    emitWorkerSessionClosed({username: session.username, sessionId: session.id})
    log.info(`Closed ${sessionTag(session)}`)
    return null
}

export {closeSession, Unauthorized}
