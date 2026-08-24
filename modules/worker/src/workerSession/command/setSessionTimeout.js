// SetSessionTimeout — the Usage-panel keep-alive slider.
//
// The only command that REPLACES a deadline instead of ratcheting it. Every automatic signal moves
// deadlines with GREATEST so that a late or small event can never shorten a session; a person
// dragging a slider is neither late nor automatic, and the control only reads honestly if the
// cursor shows the current keep-alive and moving it sets that value.
//
// Returns {username, applied}. `applied` is false when no ACTIVE row matched.

import {NotFoundException} from '#sepal/exception'

import {Unauthorized} from './closeSession.js'

const setSessionTimeout = async ({sessionId, username, minutes}, {repo}) => {
    let session
    try {
        session = await repo.getSession(sessionId)
    } catch (_error) {
        throw new NotFoundException(`Non-existing session: ${sessionId}`)
    }
    if (username && username !== session.username) {
        throw new Unauthorized(`Session not owned by user: ${session.id}`)
    }
    const applied = await repo.setSessionTimeout({sessionId, minutes})
    return {username: session.username, applied}
}

export {setSessionTimeout}
