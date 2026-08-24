// Loads PENDING+ACTIVE sessions and hands them (+ minAge/timeUnit) to the instanceManager,
// which reclaims instances not bound to any of them.

import {State} from '../workerSession.js'

const releaseUnusedInstances = async (minAge, timeUnit, {repo, instanceManager}) => {
    const sessions = await repo.sessions([State.PENDING, State.ACTIVE])
    await instanceManager.releaseUnusedInstances(sessions, minAge, timeUnit)
    return null
}

export {releaseUnusedInstances}
