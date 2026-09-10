// ProvisioningRegistry — which instances are being provisioned RIGHT NOW, in this process.
//
// provisionInstance starts by deleting the instance's existing containers, so two overlapping
// provisions of one instance destroy each other's work. Every path that provisions goes through
// run(), and a second caller for the same instance is DROPPED rather than queued: the first one
// is already doing exactly what the second would ask for.
//
// An entry is keyed by instance but belongs to the session it was started for. Once that instance
// is released the entry stands for nothing — see forget().
//
// In-memory and per-process. A restart forgetting it is the safe direction — after a restart,
// nobody is provisioning anything.

const createProvisioningRegistry = () => {
    const sessionIdByInstanceId = new Map()

    const isProvisioning = instanceId => sessionIdByInstanceId.has(instanceId)

    // run(instanceId, sessionId, fn) — true when fn ran, false when it was dropped. fn's rejection
    // propagates to the caller; the entry is cleared either way, so a failed provision does not
    // lock the instance out of the next attempt.
    const run = async (instanceId, sessionId, fn) => {
        if (sessionIdByInstanceId.has(instanceId)) {
            return false
        }
        sessionIdByInstanceId.set(instanceId, sessionId)
        try {
            await fn()
        } finally {
            // Clear only the entry THIS call made. A forgotten provision that settles late must
            // not take the entry of the session that holds the instance now with it.
            if (sessionIdByInstanceId.get(instanceId) === sessionId) {
                sessionIdByInstanceId.delete(instanceId)
            }
        }
        return true
    }

    // forget(instanceId) — the instance is no longer the session's, so neither is its entry.
    // Provisioning retries for up to seventeen minutes; without this, an entry against an
    // instance released mid-provision outlives its session and silently drops the provisioning of
    // whichever session the pool hands that instance to next.
    const forget = instanceId => sessionIdByInstanceId.delete(instanceId)

    return {isProvisioning, run, forget}
}

export {createProvisioningRegistry}
