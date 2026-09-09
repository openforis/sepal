// RequestInstance:
//   1. Candidates come from the hosting service ALONE — it is the only authority on what exists.
//   2. Claim them in order until one INSERT wins; a lost race moves to the next candidate rather
//      than launching, so an available idle instance is always used.
//   3. Won → tag the reservation, wait for the address, emit InstancePendingProvisioning.
//   4. Every candidate taken → launchReserved, record the claim, then wait for the address.
//   5. On any exception → emit FailedToRequestInstance, rethrow.

import {getLogger} from '#sepal/log'

import {instanceTag, userTag} from '../../tag.js'
import {
    emitFailedToRequestInstance,
    emitInstanceLaunched,
    emitInstancePendingProvisioning,
} from '../events.js'
import {reserve} from '../workerInstance.js'

const log = getLogger('worker/requestInstance')

const launchedAt = instance => new Date(instance.launchTime ?? 0).getTime()
const isBooted = instance => Boolean(instance.running && instance.host)

// Booted instances first, then those still coming up; oldest launch first within each group.
// Same instinct as SizeIdlePool terminating newest-first for surplus: keep and use the warm machine.
const ordered = instances =>
    [...instances].sort((a, b) =>
        Number(isBooted(b)) - Number(isBooted(a)) || launchedAt(a) - launchedAt(b)
    )

const requestInstance = async ({workerType, instanceType, username, sessionId}, {claims, provider}) => {
    log.debug(`Requesting ${instanceType} instance for ${userTag(username)} (${workerType})...`)
    const reservation = {username, workerType, sessionId}

    try {
        for (const candidate of ordered(await provider.idleInstances(instanceType))) {
            if (!await claims.claim(candidate.id, sessionId)) {
                log.debug(`Lost claim on ${instanceTag(candidate)}, trying the next candidate`)
                continue
            }
            try {
                const reserved = reserve(candidate, reservation)
                await provider.reserve(reserved)
                const ready = await provider.awaitHost(reserved)
                emitInstancePendingProvisioning(ready)
                log.info(`Reserved idle ${instanceTag(ready)} for ${userTag(username)} (${workerType})`)
                return ready
            } catch (err) {
                // Release, or the instance stays claimed with no session behind it — forever.
                await claims.release(candidate.id)
                throw err
            }
        }

        return await launchInstance({instanceType, reservation}, {claims, provider})

    } catch (err) {
        emitFailedToRequestInstance(workerType, instanceType, err)
        throw err
    }
}

// launchInstance — every idle candidate was already taken, or there were none.
const launchInstance = async ({instanceType, reservation}, {claims, provider}) => {
    const {username, workerType, sessionId} = reservation
    const instance = await provider.launchReserved(instanceType, reservation)
    // Claim BEFORE the address wait: the instance is already tagged reserved with no session row
    // behind it, and the claim is the only thing keeping ReleaseUnusedInstances off it while it
    // boots. A failed INSERT is logged rather than fatal — failing here would strand a running
    // machine, and ReleaseUnusedInstances reclaims it if the session never materialises.
    try {
        await claims.claim(instance.id, sessionId)
    } catch (err) {
        log.error(`Failed to record claim on ${instanceTag(instance)}: ${err.message}`)
    }
    const ready = await provider.awaitHost(instance)
    emitInstanceLaunched(ready)
    log.info(`Launched new ${instanceTag(ready)} for ${userTag(username)} (${workerType})`)
    return ready
}

export {requestInstance}
