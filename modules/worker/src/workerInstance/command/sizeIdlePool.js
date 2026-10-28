// SizeIdlePool — for each type in (live idle grouping ∪ target-map keys), with
// target = targetMap[type] ?? 0:
//   currentIdle < target → launchIdle(type, deficit)
//   currentIdle > target → the N most recently launched are surplus
//   currentIdle == target → no-op
// A type with idle instances but NO target entry therefore gets target 0 and all of them are
// surplus — that is what stops idle pools of retired types leaking cost.
//
// The surplus of every type then fills the STOPPED pool, oldest first, up to stoppedPoolSize minus
// what the pool already holds; the rest is terminated. Whatever deficit the surplus does not fill
// is warm-up launched. stoppedPoolSize 0 leaves the stopped pool untouched and unqueried.
//
// A surplus instance is pooled or terminated only under a claim, the same election a request runs
// before reserving an idle instance: whichever claims first has it, so the cycle never stops or
// terminates an instance a request is in the middle of reserving. The pool slot of an instance a
// request took goes to the next surplus instance.

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'

const log = getLogger('worker/sizeIdlePool')

// Not a session id. Left behind by a worker dying mid-cycle, ReclaimStaleClaims drops it like any
// other claim whose session is not open.
const POOL_CYCLE_CLAIM = 'pool-cycle'

const launchedAt = instance => new Date(instance.launchTime ?? 0).getTime()

const sizeIdlePool = async (targetIdleCountByInstanceType, stoppedPoolSize, {provider, claims}) => {
    log.debug('Sizing idle pool', targetIdleCountByInstanceType, `stopped pool size: ${stoppedPoolSize}`)

    const targetMap = targetIdleCountByInstanceType instanceof Map
        ? targetIdleCountByInstanceType
        : new Map(Object.entries(targetIdleCountByInstanceType))

    const surplus = await sizeRunningIdle(targetMap, {provider})
    const deficit = stoppedPoolSize > 0
        ? Math.max(0, stoppedPoolSize - (await provider.pooledInstances()).length)
        : 0

    // Oldest first: they have read the most of their disk, which is what a pooled start is for.
    let pooled = 0
    for (const instance of [...surplus].sort((a, b) => launchedAt(a) - launchedAt(b))) {
        if (pooled < deficit) {
            const done = await attempt(`pool ${instanceTag(instance)}`, () =>
                underClaim(instance, () => provider.pool(instance.id), {claims}))
            pooled += done ? 1 : 0
        } else {
            await attempt(`terminate ${instanceTag(instance)}`, () =>
                underClaim(instance, () => provider.terminate(instance.id), {claims}))
        }
    }

    const warmUps = deficit - pooled
    if (warmUps > 0) {
        log.info(`Launching ${warmUps} warm-up instance(s) for the stopped pool`)
        await attempt('launch warm-up instances', () => provider.launchPooled(warmUps))
    }
}

// sizeRunningIdle — launches each type's idle deficit and resolves to every type's surplus.
const sizeRunningIdle = async (targetMap, {provider}) => {
    const allIdle = await provider.idleInstances()  // no-arg = all idle
    const idleByType = new Map()
    for (const instance of allIdle) {
        const list = idleByType.get(instance.type) ?? []
        list.push(instance)
        idleByType.set(instance.type, list)
    }

    const allTypes = new Set([...idleByType.keys(), ...targetMap.keys()])
    const surplus = []

    for (const instanceType of allTypes) {
        const currentIdle = idleByType.get(instanceType) ?? []
        const currentCount = currentIdle.length
        const targetCount = targetMap.get(instanceType) ?? 0

        if (currentCount < targetCount) {
            const deficit = targetCount - currentCount
            log.info(`Launching ${deficit} idle instance(s) of type ${instanceType}`)
            await provider.launchIdle(instanceType, deficit)
        } else if (currentCount > targetCount) {
            log.info(`${currentCount - targetCount} surplus idle instance(s) of type ${instanceType}`)
            // Newest first. The surplus is almost always the pool replacement launched the moment
            // the previous idle instance was reserved, racing the released instance coming back:
            // dropping the oldest throws away the one that is fully booted and keeps the one that
            // may still be starting, so the next session pays for a cold boot either way.
            surplus.push(...[...currentIdle]
                .sort((a, b) => launchedAt(b) - launchedAt(a))
                .slice(0, currentCount - targetCount))
        } else {
            log.debug(`Type ${instanceType} at target (${targetCount}) - no-op`)
        }
    }
    return surplus
}

// Resolves whether the operation ran. A lost claim belongs to a request reserving the instance:
// leave it alone.
const underClaim = async (instance, operation, {claims}) => {
    if (!await claims.claim(instance.id, POOL_CYCLE_CLAIM)) {
        log.debug(`${instanceTag(instance)} is being reserved - left alone`)
        return false
    }
    try {
        await operation()
        return true
    } finally {
        await claims.release(instance.id)
    }
}

// Resolves whether the operation succeeded. One failed instance must not stop the sizing of the
// rest; the next cycle recomputes everything.
const attempt = async (description, operation) => {
    try {
        return await operation() !== false
    } catch (err) {
        log.error(`Failed to ${description}: ${err.message}`)
        return false
    }
}

export {sizeIdlePool}
