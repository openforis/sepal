// Loads the user's PENDING+ACTIVE sessions and closes each: close the row → publish → release
// the instance, all inside a per-session try/catch so a single failure is logged and
// skipped.

import {getLogger} from '#sepal/log'

import {sessionTag} from '../../tag.js'
import {close, isPending, State} from '../workerSession.js'

const log = getLogger('worker/closeUserSessions')

const closeUserSessions = async (username, {repo, instanceManager, emitWorkerSessionClosed, recoverStartup = false}) => {
    const sessions = await repo.userSessions(username, [State.PENDING, State.ACTIVE])
    for (const session of sessions) {
        try {
            if (!await repo.update(close(session))) {
                continue
            }
            emitWorkerSessionClosed({username: session.username, sessionId: session.id})
            const releaseOptions = {retire: isPending(session)}
            if (isPending(session) && recoverStartup) releaseOptions.recoverStartup = true
            await instanceManager.releaseInstance(session.instance.id, session.id, releaseOptions)
        } catch (error) {
            log.error(`Failed to close ${sessionTag(session)}`, error)
        }
    }
    return null
}

export {closeUserSessions}
