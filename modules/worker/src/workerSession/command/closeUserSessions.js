// Loads the user's PENDING+ACTIVE sessions and closes each: close the row → release the
// instance → publish, all inside a per-session try/catch so a single failure is logged and
// skipped.

import {getLogger} from '#sepal/log'

import {sessionTag} from '../../tag.js'
import {close, State} from '../workerSession.js'

const log = getLogger('worker/closeUserSessions')

const closeUserSessions = async (username, {repo, instanceManager, emitWorkerSessionClosed}) => {
    const sessions = await repo.userSessions(username, [State.PENDING, State.ACTIVE])
    for (const session of sessions) {
        try {
            await repo.update(close(session))
            await instanceManager.releaseInstance(session.instance.id)
            emitWorkerSessionClosed({username: session.username, sessionId: session.id})
        } catch (error) {
            log.error(`Failed to close ${sessionTag(session)}`, error)
        }
    }
    return null
}

export {closeUserSessions}
