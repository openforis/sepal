// Loads PENDING+ACTIVE sessions and hands them (+ the grace period) to the instanceManager, which
// drops claims that no longer stand for a live allocation.

import {State} from '../workerSession.js'

const reclaimStaleClaims = async (graceMs, {repo, instanceManager}) => {
    const sessions = await repo.sessions([State.PENDING, State.ACTIVE])
    await instanceManager.reclaimStaleClaims(sessions, graceMs)
    return null
}

export {reclaimStaleClaims}
