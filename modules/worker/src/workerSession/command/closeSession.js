// CloseSession runs as TWO SEPARATE TRANSACTIONS (do NOT merge):
//   step 1: repo.update(session.close())   → state=CLOSED, api_key=NULL
//   then:   emit WorkerSessionClosed {username, sessionId} to stop billing
//   step 2: release the instance; manual warmed PENDING sessions can recover through stop
// The row-close must commit before the instance release runs.
//
// Ownership check: if command.username is set AND != session.username → throw Unauthorized.
// Guard: if session state not in [PENDING, ACTIVE], or the guarded row-close changes nothing
// (closed concurrently) → no-op return.

import {getLogger} from '#sepal/log'

import {sessionTag} from '../../tag.js'
import {close, isActive, isPending} from '../workerSession.js'

const log = getLogger('worker/closeSession')

class Unauthorized extends Error {
    constructor(message) {
        super(message)
        this.name = 'Unauthorized'
    }
}

// username — optional owner check (null/undefined = system/admin, which skips the check).
const closeSession = async ({sessionId, username, recoverStartup = false}, {repo, instanceManager, emitWorkerSessionClosed}) => {
    const session = await repo.getSession(sessionId)
    if (username && username !== session.username) {
        throw new Unauthorized(`Session not owned by user: ${session.id}`)
    }
    if (!isActive(session) && !isPending(session)) {
        return null // already closed / not closeable — no-op (Groovy parity)
    }
    // step 1 — close the row (separate transaction; CLOSED update nulls api_key). A concurrent
    // closer that got there first owns the release and the event.
    if (!await repo.update(close(session))) {
        return null
    }
    emitWorkerSessionClosed({username: session.username, sessionId: session.id})
    // step 2 — release the instance (separate transaction)
    const releaseOptions = {retire: isPending(session)}
    if (isPending(session) && recoverStartup) releaseOptions.recoverStartup = true
    await instanceManager.releaseInstance(session.instance.id, session.id, releaseOptions)
    log.info(`Closed ${sessionTag(session)}`)
    return null
}

export {closeSession, Unauthorized}
