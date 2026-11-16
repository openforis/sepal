// Coordinate provisioning and release in one process; durable claims protect allocation.
// Replacing an entry cancels its callbacks by identity, even if the same session starts again.

const createProvisioningRegistry = () => {
    const entries = new Map()

    // Reconciliation treats releases as busy too.
    const isProvisioning = instanceId => entries.has(instanceId)

    // Duplicate starts are dropped; fn receives a predicate invalidated by release.
    const run = async (instanceId, sessionId, fn) => {
        sessionId = sessionId ?? ''
        if (entries.has(instanceId)) {
            return false
        }
        const entry = {sessionId}
        entries.set(instanceId, entry)
        const isCurrent = () => entries.get(instanceId) === entry
        try {
            await fn(isCurrent)
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
        // A previous entry means unfinished provisioning or release; retries retire conservatively.
        const releaseToken = {
            instanceId,
            sessionId,
            retire: retire || !!previous,
            createdAt: previous?.createdAt ?? Date.now(),
            missingSince: previous?.missingSince ?? null,
            isCurrent: () => entries.get(instanceId) === releaseToken,
            finish: () => finishRelease(instanceId, releaseToken),
        }
        entries.set(instanceId, releaseToken)
        return releaseToken
    }

    const finishRelease = (instanceId, releaseToken) => {
        if (entries.get(instanceId) === releaseToken) {
            entries.delete(instanceId)
        }
    }

    const pendingReleases = () => [...entries.values()]
        .filter(entry => Object.hasOwn(entry, 'retire'))

    return {isProvisioning, run, beginRelease, finishRelease, pendingReleases}
}

export {createProvisioningRegistry}
