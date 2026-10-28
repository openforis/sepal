// ExtendSession — the command wrapper around the repository's ratchet. Replaces
// SetEarliestTimeoutTime: the keepAlive slider stopped being an override and became an ordinary
// ratchet like every other extension event.
//
// Every caller reaches the SAME single UPDATE (workerSessionRepository.extendSession), which is
// what makes the deadline monotonic and the notification reset atomic with it.
//
// Returns {username, extended}. `extended` is false when no ACTIVE row matched — the one-shot
// senders (app or terminal opened, the Extend button, the email link) have no successor to
// re-assert them, so they need to see that the extension landed rather than assume it.

import {NotFoundException} from '#sepal/exception'

import {Unauthorized} from './closeSession.js'

const extendSession = async ({sessionId, username, minutes, interaction = true, capHours = null, reason = null}, {repo}) => {
    let session
    try {
        session = await repo.getSession(sessionId)
    } catch (_error) {
        throw new NotFoundException(`Non-existing session: ${sessionId}`)
    }
    if (username && username !== session.username) {
        throw new Unauthorized(`Session not owned by user: ${session.id}`)
    }
    const extended = await repo.extendSession({sessionId, minutes, interaction, capHours, reason})
    return {username: session.username, extended}
}

export {extendSession}
