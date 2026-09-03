// SizeIdlePool — for each type in (live idle grouping ∪ target-map keys), with
// target = targetMap[type] ?? 0:
//   currentIdle < target → launchIdle(type, deficit) + repo.launched(list)
//   currentIdle > target → terminate the first N excess: provider.terminate + repo.terminated
//   currentIdle == target → no-op
// A type with idle instances but NO target entry therefore gets target 0 and has all of them
// terminated — that is what stops idle pools of retired types leaking cost.

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'

const log = getLogger('worker/sizeIdlePool')

const sizeIdlePool = async (targetIdleCountByInstanceType, {repo, provider}) => {
    log.info('Sizing idle pool', targetIdleCountByInstanceType)

    const targetMap = targetIdleCountByInstanceType instanceof Map
        ? targetIdleCountByInstanceType
        : new Map(Object.entries(targetIdleCountByInstanceType))

    const allIdle = await provider.idleInstances()  // no-arg = all idle
    const idleByType = new Map()
    for (const instance of allIdle) {
        const list = idleByType.get(instance.type) ?? []
        list.push(instance)
        idleByType.set(instance.type, list)
    }

    const allTypes = new Set([...idleByType.keys(), ...targetMap.keys()])

    for (const instanceType of allTypes) {
        const currentIdle = idleByType.get(instanceType) ?? []
        const currentCount = currentIdle.length
        const targetCount = targetMap.get(instanceType) ?? 0

        if (currentCount < targetCount) {
            const deficit = targetCount - currentCount
            log.info(`Launching ${deficit} idle instance(s) of type ${instanceType}`)
            const launched = await provider.launchIdle(instanceType, deficit)
            if (launched && launched.length > 0) {
                await repo.launched(launched)
            }
        } else if (currentCount > targetCount) {
            const surplus = currentCount - targetCount
            log.info(`Terminating ${surplus} surplus idle instance(s) of type ${instanceType}`)
            const toTerminate = currentIdle.slice(0, surplus)
            for (const instance of toTerminate) {
                try {
                    await provider.terminate(instance.id)
                    await repo.terminated(instance.id)
                } catch (err) {
                    log.error(`Failed to terminate ${instanceTag(instance)}: ${err.message}`)
                }
            }
        } else {
            log.debug(`Type ${instanceType} at target (${targetCount}) - no-op`)
        }
    }
}

export {sizeIdlePool}
