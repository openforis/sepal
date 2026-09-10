// ReleaseInstance:
//   1. provider.getInstance(instanceId) — if null, drop any orphaned claim and return.
//   2. claims.release(instanceId) — the DELETE's row count elects the undeployer. False means the
//      row was already gone, so this call did not win it: skip undeploy, but STILL call
//      provider.release(instanceId) and emit InstanceReleased.
//   3. Won the delete AND instance.host set → provisioner.undeploy(instance).
//   4. provider.release(instanceId) → emit InstanceReleased(instance.release()).
//   5. On ANY exception → emit FailedToReleaseInstance, terminate the instance (swallowing its
//      own errors), then claims.release(instanceId).

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'
import {
    emitFailedToReleaseInstance,
    emitInstanceReleased,
} from '../events.js'
import {release} from '../workerInstance.js'

const log = getLogger('worker/releaseInstance')

const releaseInstance = async (instanceId, {claims, provider, provisioner}) => {
    log.debug(`Releasing ${instanceTag(instanceId)}...`)

    let instance
    try {
        instance = await provider.getInstance(instanceId)
        if (!instance) {
            log.warn(`${instanceTag(instanceId)} not found in provider - nothing to release`)
            await claims.release(instanceId)
            return
        }

        // Losing the delete normally means a concurrent releaseInstance is doing the undeploy;
        // ReclaimStaleClaims routes an abandoned claim through here rather than deleting the row
        // itself, so it does not manufacture the other case — a row that never existed.
        const lostDelete = !(await claims.release(instanceId))
        if (lostDelete) {
            log.info(`No claim deleted for ${instanceTag(instanceId)} - skipping undeploy`)
        } else if (instance.host) {
            await provisioner.undeploy(instance)
        }

        // Always reached, whoever won the delete.
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
            await claims.release(instanceId)
        } catch (termErr) {
            log.error(`Failed to release claim for ${instanceTag(instanceId)} during error recovery: ${termErr.message}`)
        }
    }
}

export {releaseInstance}
