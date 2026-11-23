// Coordinate provisioning and release in one process; durable claims protect allocation.
// Replacing an entry cancels its callbacks by identity, even if the same session starts again.

const createProvisioningRegistry = () => {
    const entries = new Map()

    // Reconciliation treats releases as busy too.
    const isProvisioning = instanceId => entries.has(instanceId)

    // Duplicate starts are dropped; fn receives a predicate invalidated by release.
    const run = async (instanceId, sessionId, fn) => {
        sessionId = sessionId ?? ''
        const previous = entries.get(instanceId)
        if (previous && (!Object.hasOwn(previous, 'retire') || previous.sessionId === sessionId)) {
            return false
        }
        const entry = {sessionId, scratch: Promise.resolve(null)}
        entries.set(instanceId, entry)
        const isCurrent = () => entries.get(instanceId) === entry
        const prepareScratch = attach => {
            const pending = (async () => attach())()
            entry.scratch = Promise.all([entry.scratch, pending]).then(([, device]) => device)
            // Keep failed attachment history for recovery, even if provisioning retries successfully.
            entry.scratch.catch(() => {})
            return pending
        }
        try {
            await fn(isCurrent, {prepareScratch})
        } finally {
            // A late completion must not clear its replacement's gate.
            if (isCurrent()) {
                entries.delete(instanceId)
            }
        }
        return true
    }

    const beginRelease = (instanceId, sessionId, {retire = false} = {}) => {
        sessionId = sessionId ?? ''
        const previous = entries.get(instanceId)
        if (previous && previous.sessionId !== sessionId) {
            return null
        }
        const releaseToken = {
            sessionId,
            retire: retire || !!previous,
            scratch: previous?.scratch,
            isCurrent: () => entries.get(instanceId) === releaseToken,
        }
        entries.set(instanceId, releaseToken)
        return releaseToken
    }

    const finishRelease = (instanceId, releaseToken) => {
        if (entries.get(instanceId) === releaseToken) {
            entries.delete(instanceId)
        }
    }

    return {isProvisioning, run, beginRelease, finishRelease}
}

export {createProvisioningRegistry}
