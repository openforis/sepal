// ReleaseInstance:
//   1. provider.getInstance(instanceId) — if null, nothing to do.
//   2. repo.released(instanceId) race-check — false means we lost the race: skip undeploy, but
//      STILL call provider.release(instanceId) and emit InstanceReleased.
//   3. Won race AND instance.host set → provisioner.undeploy(instance).
//   4. provider.release(instanceId) → emit InstanceReleased(instance.release()).
//   5. On ANY exception → emit FailedToReleaseInstance, terminate the instance (swallowing its
//      own errors), then repo.terminated(instanceId).

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'
import {
    emitFailedToReleaseInstance,
    emitInstanceReleased,
} from '../events.js'
import {release} from '../workerInstance.js'

const log = getLogger('worker/releaseInstance')

const releaseInstance = async (instanceId, {repo, provider, provisioner}) => {
    log.debug(`Releasing ${instanceTag(instanceId)}...`)

    let instance
    try {
        instance = await provider.getInstance(instanceId)
        if (!instance) {
            log.warn(`${instanceTag(instanceId)} not found in provider - nothing to release`)
            return
        }

        const raceCondition = !(await repo.released(instanceId))
        if (raceCondition) {
            log.info(`Race condition releasing ${instanceTag(instanceId)} - skipping undeploy`)
        } else if (instance.host) {
            await provisioner.undeploy(instance)
        }

        // Always reached, race or not.
        await provider.release(instanceId)
        const releasedInstance = release(instance)
        emitInstanceReleased(releasedInstance)
        log.info(`Released ${instanceTag(instanceId)}`)

    } catch (err) {
        emitFailedToReleaseInstance(instanceId, err)
        log.error(`Failed to release ${instanceTag(instanceId)}: ${err.message}`)

        try {
            await provider.terminate(instanceId)
        } catch (termErr) {
            log.error(`Failed to terminate ${instanceTag(instanceId)} during error recovery: ${termErr.message}`)
        }
        try {
            await repo.terminated(instanceId)
        } catch (termErr) {
            log.error(`Failed to mark ${instanceTag(instanceId)} terminated in repo: ${termErr.message}`)
        }
    }
}

export {releaseInstance}
