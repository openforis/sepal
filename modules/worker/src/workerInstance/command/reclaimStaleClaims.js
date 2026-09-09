// ReclaimStaleClaims — drops claims that no longer stand for a live allocation.
//
// A claim outlives its purpose two ways:
//   instance gone      → the hosting service no longer reports it at all
//   session never came → the worker died between claiming and the session row being inserted
//
// graceMs must exceed the worst case between claiming an instance and its session row existing:
// RequestSession inserts the row only after RequestInstance returns, and awaitHost can spend up to
// 300s waiting for an address. Reclaiming inside that window would take an instance away from a
// request still in flight.
//
// Deleting a claim never touches the hosting service. An instance still tagged reserved with no
// session behind it is ReleaseUnusedInstances' to reclaim — the two sweeps are complementary.

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'

const log = getLogger('worker/reclaimStaleClaims')

const reclaimStaleClaims = async (openSessionIds, graceMs, {claims, provider}) => {
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
            && now - claim.claimedAt.getTime() > graceMs
        if (gone || abandoned) {
            await claims.release(claim.instanceId)
            reclaimed++
            log.debug(`Reclaimed ${gone ? 'gone' : 'abandoned'} claim on ${instanceTag(claim.instanceId)}`)
        }
    }
    if (reclaimed > 0) {
        log.info(`Reclaimed ${reclaimed} stale claim(s)`)
    }
    return reclaimed
}

export {reclaimStaleClaims}
