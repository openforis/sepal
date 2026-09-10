// ProvisioningRegistry — which instances are being provisioned RIGHT NOW, in this process.
//
// provisionInstance starts by deleting the instance's existing containers, so two overlapping
// provisions of one instance destroy each other's work. Every path that provisions goes through
// run(), and a second caller for the same instance is DROPPED rather than queued: the first one
// is already doing exactly what the second would ask for.
//
// In-memory and per-process. A restart forgetting it is the safe direction — after a restart,
// nobody is provisioning anything.

const createProvisioningRegistry = () => {
    const inFlight = new Set()

    const isProvisioning = instanceId => inFlight.has(instanceId)

    // run(instanceId, fn) — true when fn ran, false when it was dropped. fn's rejection
    // propagates to the caller; the entry is cleared either way, so a failed provision does not
    // lock the instance out of the next attempt.
    const run = async (instanceId, fn) => {
        if (inFlight.has(instanceId)) {
            return false
        }
        inFlight.add(instanceId)
        try {
            await fn()
        } finally {
            inFlight.delete(instanceId)
        }
        return true
    }

    return {isProvisioning, run}
}

export {createProvisioningRegistry}
