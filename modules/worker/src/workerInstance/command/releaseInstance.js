// ReleaseInstance:
//   1. provider.getInstance(instanceId) — if null, drop any orphaned claim and return.
//   2. instance.host set → provisioner.undeploy(instance).
//   3. claims.release(instanceId) — cleanup, not an election: the claim outlives the container,
//      never the other way round.
//   4. provider.release(instanceId) → emit InstanceReleased(release(instance)).
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

        // Undeploy BEFORE dropping the claim. The claim is the only durable record that this
        // instance may still be carrying a container, so a worker that dies mid-release has to
        // leave it standing: ReclaimStaleClaims then finds the abandoned claim and runs the whole
        // release again. Dropping the row first and dying here stranded the previous user's
        // container on an instance ReleaseUnusedInstances went on to tag idle.
        //
        // No election is needed to keep that safe — undeploy is a force-delete by container name,
        // so the retry, and a concurrent releaser doing the same thing, find nothing to do.
        if (instance.host) {
            await provisioner.undeploy(instance)
        }
        await claims.release(instanceId)

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
