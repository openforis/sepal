// Heartbeat.
//
// update_time is bumped ONLY when the session is ACTIVE. A PENDING session's heartbeat is a
// no-op (PENDING times out on its creation_time — never refreshed).
//
// A BARE HEARTBEAT EXTENDS NOTHING. That is the whole point of the new model: the gateway beats
// for every session in its cache regardless of anyone using it, and treating that as liveness is
// what kept forgotten tabs alive indefinitely. update_time is now audit only.
//
// interaction: when explicitly true, the beat carries a REAL user interaction the gateway observed
// (input inside an app iframe, or — for a session the GUI declared unobservable — a proxied
// request), and ratchets the deadline by interactionExtensionMinutes, stamping
// last_interaction_time. Losing one is harmless: the signal repeats within a minute.
//
// Ownership check: if command.username is set AND != session.username → throw Unauthorized.
// Returns the (unchanged domain) session.
//
// Unknown and CLOSED sessions → 404. The gateway prunes its per-app session cache on
// heartbeat 404; the REST layer serializes every non-PENDING state as 'ACTIVE', so
// returning a CLOSED row as 200 would keep ghost cache entries alive forever (every app
// ever started would resolve to a dead instance and flag `reused`).

import {NotFoundException} from '#sepal/exception'

import {isActive, isPending} from '../workerSession.js'
import {Unauthorized} from './closeSession.js'

const notFound = message => new NotFoundException(message)

const heartbeat = async ({sessionId, username, interaction}, {repo, interactionExtensionMinutes}) => {
    let session
    try {
        session = await repo.getSession(sessionId)
    } catch (_error) {
        throw notFound(`Non-existing session: ${sessionId}`)
    }
    if (username && username !== session.username) {
        throw new Unauthorized(`Session not owned by user: ${session.id}`)
    }
    if (!isActive(session) && !isPending(session)) {
        throw notFound(`Session not open: ${sessionId}`)
    }
    if (isActive(session)) {
        await repo.update(session)
        if (interaction) {
            await repo.extendSession({
                sessionId,
                minutes: interactionExtensionMinutes,
                interaction: true,
                reason: 'browser-input',
            })
        }
    }
    return session
}

export {heartbeat}
