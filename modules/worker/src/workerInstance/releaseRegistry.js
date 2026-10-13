// ReleaseRegistry — which instances are being released RIGHT NOW, in this process.
//
// Releasing waits for the instance's Data uploads, which can take minutes, and the session is
// closed before its release is awaited, so ReclaimStaleClaims sees the claim as abandoned and
// releases it again. A second release of an instance in flight joins the first rather than
// undeploying again or returning to the pool an instance that may already be reused.
//
// In-memory and per-process, like the ProvisioningRegistry: after a restart nothing is releasing,
// and ReclaimStaleClaims redoes whatever release died with the process.

export const createReleaseRegistry = () => {
    const inFlight = new Map()

    const isReleasing = instanceId => inFlight.has(instanceId)

    // run(instanceId, fn) — a caller for an instance already in flight awaits that release instead.
    const run = (instanceId, fn) => {
        if (!inFlight.has(instanceId)) {
            const release = (async () => {
                try {
                    await fn()
                } finally {
                    inFlight.delete(instanceId)
                }
            })()
            inFlight.set(instanceId, release)
        }
        return inFlight.get(instanceId)
    }

    return {isReleasing, run}
}
