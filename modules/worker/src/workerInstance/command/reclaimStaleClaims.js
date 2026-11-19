// Claim-age grace covers allocation before the session row exists and transient EC2 tag gaps.
// Absence from filtered idle/reserved inventory is not confirmation of termination.
// Abandoned live reservations retire because pre-restart Docker work may still be running.

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'
import {releaseGoneClaim, releaseInstance} from './releaseInstance.js'

const log = getLogger('worker/reclaimStaleClaims')

const reclaimStaleClaims = async (openSessionIds, graceMs, deps) => {
    const {claims, provider} = deps
    const [idle, reserved, recovering] = await Promise.all([
        provider.idleInstances(),
        provider.reservedInstances(),
        provider.recoveringInstances(),
    ])
    const liveIds = new Set([...idle, ...reserved, ...recovering].map(({id}) => id))
    const openIds = new Set(openSessionIds)
    const now = Date.now()
    const claimSnapshot = await claims.all()
    const releaseDeps = {...deps, retire: true}
    const reclaimed = await reclaimClaims({claimSnapshot, liveIds, openIds, now, graceMs, releaseDeps})

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
    const {releasing} = releaseDeps
    // Filtered inventory can miss an idle transition while its release still owns the claim.
    if (releasing?.has(`${claim.instanceId}/${claim.sessionId ?? ''}`)) return false
    if (claim.recoveryStartedAt) {
        if (openIds.has(claim.sessionId)) return false
        return retryRecovery(claim, {liveIds, now, graceMs, releaseDeps})
    }
    const gone = !liveIds.has(claim.instanceId)
    const abandoned = !openIds.has(claim.sessionId)
    if (!gone && !abandoned) {
        return false
    }
    if (now - claim.claimedAt.getTime() <= graceMs) {
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

const retryRecovery = async (claim, {liveIds, now, graceMs, releaseDeps}) => {
    try {
        const matureAbsence = !liveIds.has(claim.instanceId)
            && now - claim.recoveryStartedAt.getTime() > graceMs
        if (matureAbsence) {
            const missing = await releaseDeps.provider.getInstance(claim.instanceId).then(
                () => false,
                error => {
                    if (error.name === 'InvalidInstanceID.NotFound') return true
                    throw error
                }
            )
            if (missing) {
                // Existing absence policy, with a by-ID check; negative evidence never admits a pool return.
                await releaseGoneClaim(claim.instanceId, claim.sessionId, releaseDeps)
                return true
            }
        }
        await releaseInstance(claim.instanceId, claim.sessionId, {...releaseDeps, recovering: true})
        return true
    } catch (error) {
        log.error(`Failed to recover ${instanceTag(claim.instanceId)} (continuing): ${error.message}`)
        return false
    }
}

export {reclaimStaleClaims}
