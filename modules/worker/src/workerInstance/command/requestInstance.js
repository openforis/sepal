// RequestInstance:
//   1. Intersect repo.idleInstances(type) ∩ provider.idleInstances(type) by id, take the FIRST.
//   2. Race-safe reserve via repo.reserved(id, workerType) — a single UPDATE.
//      won  → provider.reserve(instance) + emit InstancePendingProvisioning
//      lost → launch a new instance; the remaining idle candidates are NOT retried.
//   3. No idle found (or race lost): launchReserved → repo.launched → emit InstanceLaunched.
//   4. On any exception → emit FailedToRequestInstance, rethrow.

import {getLogger} from '#sepal/log'

import {instanceTag, userTag} from '../../tag.js'
import {
    emitFailedToRequestInstance,
    emitInstanceLaunched,
    emitInstancePendingProvisioning,
} from '../events.js'
import {reserve} from '../workerInstance.js'

const log = getLogger('worker/requestInstance')

const requestInstance = async ({workerType, instanceType, username}, {repo, provider}) => {
    log.debug(`Requesting ${instanceType} instance for ${userTag(username)} (${workerType})...`)

    try {
        const [repoIdleIds, providerIdleInstances] = await Promise.all([
            repo.idleInstances(instanceType),
            provider.idleInstances(instanceType),
        ])

        const repoIdleSet = new Set(repoIdleIds)
        // Instances idle in BOTH repo (worker_type IS NULL) and provider (in-memory idle);
        // take the first candidate only.
        const sharedIdle = providerIdleInstances.filter(inst => repoIdleSet.has(inst.id))
        const idleInstance = sharedIdle[0] ?? null

        if (idleInstance) {
            const reservation = {username, workerType}
            // Single race-safe UPDATE — returns true only if we won
            const won = await repo.reserved(idleInstance.id, workerType)
            if (won) {
                const reservedInstance = reserve(idleInstance, reservation)
                await provider.reserve(reservedInstance)
                emitInstancePendingProvisioning(reservedInstance)
                log.info(`Reserved idle ${instanceTag(idleInstance)} for ${userTag(username)} (${workerType})`)
                return reservedInstance
            }
            // Lost race → go straight to launch; the remaining idle candidates are not retried.
            log.info(`Lost race on idle ${instanceTag(idleInstance)}, launching new instead`)
        }

        return await launchInstance({workerType, instanceType, username}, {repo, provider})

    } catch (err) {
        emitFailedToRequestInstance(workerType, instanceType, err)
        throw err
    }
}

// launchInstance — called when no idle instance is available, or the race for one was lost.
const launchInstance = async ({workerType, instanceType, username}, {repo, provider}) => {
    const reservation = {username, workerType}
    const instance = await provider.launchReserved(instanceType, reservation)
    await repo.launched(instance)
    emitInstanceLaunched(instance)
    log.info(`Launched new ${instanceTag(instance)} for ${userTag(username)} (${workerType})`)
    return instance
}

export {requestInstance}
