// Claim-age grace covers allocation before the session row exists and transient EC2 tag gaps.
// Absence from filtered idle/reserved inventory is not confirmation of termination.
// Abandoned live reservations retire because pre-restart Docker work may still be running.

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'
import {releaseGoneClaim, releaseInstance} from './releaseInstance.js'

const log = getLogger('worker/reclaimStaleClaims')

const reclaimStaleClaims = async (openSessionIds, graceMs, deps) => {
    const {claims, provider, provisioning} = deps
    const [idle, reserved] = await Promise.all([
        provider.idleInstances(),
        provider.reservedInstances(),
    ])
    const liveIds = new Set([...idle, ...reserved].map(({id}) => id))
    const openIds = new Set(openSessionIds)
    const now = Date.now()
    const claimSnapshot = await claims.all()
    const releaseDeps = {...deps, retire: true}
    const reclaimed = await reclaimClaims({claimSnapshot, liveIds, openIds, now, graceMs, releaseDeps})

    await retryPendingReleases({
        pendingReleases: provisioning?.pendingReleases() ?? [],
        claimSnapshot,
        releaseDeps,
        graceMs,
    })
    if (reclaimed > 0) {
        log.info(`Reclaimed ${reclaimed} stale claim(s)`)
    }
    return reclaimed
}

const reclaimClaims = async ({claimSnapshot, ...deps}) => {
    let reclaimed = 0
    for (const claim of claimSnapshot) {
        if (await reclaimClaim(claim, deps)) {
            reclaimed++
        }
    }
    return reclaimed
}

const reclaimClaim = async (claim, {liveIds, openIds, now, graceMs, releaseDeps}) => {
    const gone = !liveIds.has(claim.instanceId)
    const abandoned = !openIds.has(claim.sessionId)
    if (!gone && !abandoned) {
        return false
    }
    if (now - claim.claimedAt.getTime() <= graceMs) {
        return false
    }
    const {releasing} = releaseDeps
    // Filtered inventory can miss an idle transition while its release still owns the claim.
    if (releasing?.has(`${claim.instanceId}/${claim.sessionId ?? ''}`)) {
        return false
    }
    // Each claim is independent: one failure must not abort the others.
    try {
        if (gone) {
            await releaseGoneClaim(claim.instanceId, claim.sessionId, releaseDeps)
        } else {
            await releaseInstance(claim.instanceId, claim.sessionId, releaseDeps)
        }
        log.debug(`Reclaimed ${gone ? 'gone' : 'abandoned'} claim on ${instanceTag(claim.instanceId)}`)
        return true
    } catch (err) {
        log.error(`Failed to reclaim claim on ${instanceTag(claim.instanceId)} (continuing): ${err.message}`)
        return false
    }
}

// Failed ownership reads can leave a retirement gate without its own claim to drive recovery.
const retryPendingReleases = async ({pendingReleases, claimSnapshot, releaseDeps, graceMs}) => {
    const claimedSessions = new Map(claimSnapshot.map(({instanceId, sessionId}) => [instanceId, sessionId]))
    for (const pending of pendingReleases) {
        const releaseInFlight = releaseDeps.releasing?.has(`${pending.instanceId}/${pending.sessionId ?? ''}`)
        if (!pending.isCurrent() || releaseInFlight) {
            continue
        }
        if (claimedSessions.get(pending.instanceId) === pending.sessionId) {
            pending.missingSince = null
            continue
        }
        try {
            await retryPendingRelease(pending, {releaseDeps, graceMs})
        } catch (err) {
            if (pending.isCurrent()) {
                pending.missingSince = null
            }
            log.error(`Failed to retry pending release of ${instanceTag(pending.instanceId)} (continuing): ${err.message}`)
        }
    }
}

const retryPendingRelease = async (pending, {releaseDeps, graceMs}) => {
    const {provider} = releaseDeps
    if (provider.isInstanceMissing) {
        const missing = await provider.isInstanceMissing(pending.instanceId)
        if (!pending.isCurrent()) {
            return
        }
        if (missing) {
            const now = Date.now()
            pending.missingSince ??= now
            // One NotFound can be transient, even for an old gate after a termination request.
            const oldEnough = now - pending.createdAt > graceMs
            const persistentlyMissing = now - pending.missingSince > graceMs
            if (oldEnough && persistentlyMissing) {
                pending.finish()
            }
            return
        }
        pending.missingSince = null
    }
    if (pending.isCurrent()) {
        await releaseInstance(pending.instanceId, pending.sessionId, releaseDeps)
    }
}

export {reclaimStaleClaims}
