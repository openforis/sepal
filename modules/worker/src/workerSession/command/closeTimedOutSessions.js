// repo.timedOutSessions() → close each via CloseSession. Each close is isolated in its own
// try/catch so one failure does not abort the rest.
//
// PENDING ONLY. An ACTIVE session's lifetime is the stored timeout_time, swept by ExpireSessions;
// this sweep now only kills provisions that hung for ten minutes.
//
// STARTUP GRACE: kept, though a PENDING session's update_time is never refreshed anyway — a worker
// that was down while an instance came up should not close the session before the activation it
// missed can land. The caller supplies both; without a startTime the sweep runs unconditionally.

import {getLogger} from '#sepal/log'

import {sessionTag} from '../../tag.js'
import {closeSession} from './closeSession.js'

const log = getLogger('worker/closeTimedOutSessions')

const closeTimedOutSessions = async ({repo, instanceManager, emitWorkerSessionClosed, startTime = null, startupGraceMs = 0, clock = () => new Date()}) => {
    if (startTime && clock().getTime() - startTime.getTime() < startupGraceMs) {
        log.info('Within the startup grace period - skipping the timed-out session sweep')
        return null
    }
    const sessions = await repo.timedOutSessions()
    for (const session of sessions) {
        try {
            await closeSession({sessionId: session.id}, {repo, instanceManager, emitWorkerSessionClosed})
        } catch (error) {
            log.error(`Failed to close timed-out ${sessionTag(session)}`, error)
        }
    }
    return null
}

export {closeTimedOutSessions}
