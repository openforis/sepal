// ReclaimStaleClaims — drops claims that no longer stand for a live allocation.
//
// A claim outlives its purpose two ways:
//   instance gone      → the hosting service no longer reports it at all
//   session never came → the worker died between claiming and the session row being inserted
//
// graceMs guards BOTH: it must exceed the worst case between claiming an instance and its session
// row existing (RequestSession inserts the row only after RequestInstance returns, and awaitHost
// can spend minutes waiting for an address), and it absorbs the eventual consistency of the tag
// reads below — an instance being re-tagged from idle to reserved matches neither filter and reads
// as gone. Either way, reclaiming inside that window takes an instance away from a request still
// in flight; waiting out the grace on a genuinely nonexistent instance costs nothing.
//
// A gone instance has nothing to tear down, so its claim is simply deleted. An abandoned claim on
// an instance that still exists goes through ReleaseInstance instead, which undeploys before
// dropping the row: deleting it here would leave the container running on an instance
// ReleaseUnusedInstances then tags idle, with nothing left to record that it was ever there.

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'
import {releaseInstance} from './releaseInstance.js'

const log = getLogger('worker/reclaimStaleClaims')

const reclaimStaleClaims = async (openSessionIds, graceMs, {claims, provider, provisioner}) => {
    const [idle, reserved] = await Promise.all([
        provider.idleInstances(),
        provider.reservedInstances(),
    ])
    const liveIds = new Set([...idle, ...reserved].map(({id}) => id))
    const openIds = new Set(openSessionIds)
    const now = Date.now()

    let reclaimed = 0
    for (const claim of await claims.all()) {
        const gone = !liveIds.has(claim.instanceId)
        const abandoned = !openIds.has(claim.sessionId)
        if (!gone && !abandoned) {
            continue
        }
        if (now - claim.claimedAt.getTime() <= graceMs) {
            continue
        }
        // Each claim is independent: one failure must not abort the others.
        try {
            if (gone) {
                await claims.release(claim.instanceId)
            } else {
                await releaseInstance(claim.instanceId, {claims, provider, provisioner})
            }
            reclaimed++
            log.debug(`Reclaimed ${gone ? 'gone' : 'abandoned'} claim on ${instanceTag(claim.instanceId)}`)
        } catch (err) {
            log.error(`Failed to reclaim claim on ${instanceTag(claim.instanceId)} (continuing): ${err.message}`)
        }
    }
    if (reclaimed > 0) {
        log.info(`Reclaimed ${reclaimed} stale claim(s)`)
    }
    return reclaimed
}

export {reclaimStaleClaims}
