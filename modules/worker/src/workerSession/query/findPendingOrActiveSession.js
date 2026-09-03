// Loads the user's PENDING+ACTIVE sessions filtered by workerType + instanceType, then PREFERS
// an ACTIVE session over a PENDING one. Returns the matching session, or null.

import {isActive, isPending, State} from '../workerSession.js'

const findPendingOrActiveSession = async ({username, workerType, instanceType}, {repo}) => {
    const sessions = await repo.userSessions(
        username, [State.PENDING, State.ACTIVE], workerType, instanceType
    )
    return sessions.find(isActive) ?? sessions.find(isPending) ?? null
}

export {findPendingOrActiveSession}
