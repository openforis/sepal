// repo.timedOutSessions() → close each with repo.closeTimedOutSession, which closes the row only
// while it is still PENDING and overdue: an activation, update or other close since selection wins.
// Only a session it closed is announced, then has its instance retired. Each close is isolated in
// its own try/catch so one failure does not abort the rest.
//
// PENDING ONLY. An ACTIVE session's lifetime is the stored timeout_time, swept by ExpireSessions;
// this sweep now only kills provisions that hung for ten minutes. A PENDING session's update_time
// is never refreshed, so a worker that was down while an instance came up must let
// ReconcilePendingSessions land the missed activation first — the scheduler sequences the two.

import {getLogger} from '#sepal/log'

import {sessionTag} from '../../tag.js'

const log = getLogger('worker/closeTimedOutSessions')

const closeTimedOutSessions = async ({repo, instanceManager, emitWorkerSessionClosed}) => {
    const sessions = await repo.timedOutSessions()
    for (const session of sessions) {
        try {
            if (await repo.closeTimedOutSession(session.id)) {
                emitWorkerSessionClosed({username: session.username, sessionId: session.id})
                await instanceManager.releaseInstance(session.instance.id, session.id, {retire: true})
                log.info(`Closed timed-out ${sessionTag(session)}`)
            }
        } catch (error) {
            log.error(`Failed to close timed-out ${sessionTag(session)}`, error)
        }
    }
    return null
}

export {closeTimedOutSessions}
