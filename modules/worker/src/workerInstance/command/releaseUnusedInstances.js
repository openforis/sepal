// Non-transactional: each release is independent, so one failure does NOT abort the others.
// Releases reserved instances that are not in usedInstanceIds, not claimed, and older than minAge.
// timeUnit is a Java-style TimeUnit name ('MINUTES', 'SECONDS', …) or a raw ms multiplier.

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'
import {releaseInstance} from './releaseInstance.js'

const log = getLogger('worker/releaseUnusedInstances')

// Convert a Java-style TimeUnit string to milliseconds multiplier
const TIME_UNIT_MS = {
    NANOSECONDS: 1 / 1_000_000,
    MICROSECONDS: 1 / 1_000,
    MILLISECONDS: 1,
    SECONDS: 1_000,
    MINUTES: 60_000,
    HOURS: 3_600_000,
    DAYS: 86_400_000,
}

const releaseUnusedInstances = async (usedInstanceIds, minAge, timeUnit, {claims, provider, provisioner, provisioning}) => {
    log.debug(`Releasing unused instances: [${[...usedInstanceIds].map(instanceTag).join(', ')}] in use, minAge: ${minAge} ${timeUnit}`)

    const usedSet = new Set(usedInstanceIds)

    const minAgeMs = typeof timeUnit === 'number'
        ? minAge * timeUnit
        : minAge * (TIME_UNIT_MS[timeUnit] ?? 1_000)

    const now = Date.now()
    const reservedInstances = await provider.reservedInstances()

    // A claim means an allocation is in flight. RequestSession inserts the session row only after
    // RequestInstance returns, so a freshly claimed pool instance is already older than minAge with
    // no session behind it — without this guard the sweep takes it away mid-request.
    const claimedIds = new Set((await claims.all()).map(({instanceId}) => instanceId))

    // Not in use, not claimed, AND STRICTLY older than minAge — an instance exactly at minAge is NOT released.
    const toRelease = reservedInstances.filter(instance => {
        if (usedSet.has(instance.id)) return false
        if (claimedIds.has(instance.id)) return false
        const ageMs = now - new Date(instance.launchTime).getTime()
        return ageMs > minAgeMs
    })

    if (toRelease.length > 0) {
        log.info(`Releasing ${toRelease.length} of ${reservedInstances.length} reserved instances`)
    }

    // Release each independently — one failure must not abort the others.
    for (const instance of toRelease) {
        try {
            await releaseInstance(instance.id, {claims, provider, provisioner, provisioning})
        } catch (err) {
            // releaseInstance already emits FailedToReleaseInstance; swallow here to continue
            log.error(`Failed to release ${instanceTag(instance)} (continuing): ${err.message}`)
        }
    }
}

export {releaseUnusedInstances, TIME_UNIT_MS}
