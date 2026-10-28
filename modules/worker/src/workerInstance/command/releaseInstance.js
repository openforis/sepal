// ReleaseInstance:
//   1. forget any in-flight provisioning.
//   2. provider.getInstance(instanceId) — if null, drop any orphaned claim and return.
//   3. instance.host set → provisioner.undeploy(instance), then provider.deleteScratchVolume.
//   4. claims.release(instanceId) — cleanup, not an election: the claim outlives the container,
//      never the other way round.
//   5. provider.release(instanceId) → emit InstanceReleased(release(instance)).
//   6. On ANY exception → emit FailedToReleaseInstance, terminate the instance (swallowing its
//      own errors), then claims.release(instanceId).

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'
import {
    emitFailedToReleaseInstance,
    emitInstanceReleased,
} from '../events.js'
import {release} from '../workerInstance.js'

const log = getLogger('worker/releaseInstance')

// provisioning is optional: callers that never provision have nothing to forget.
const releaseInstance = async (instanceId, {claims, provider, provisioner, provisioning}) => {
    log.debug(`Releasing ${instanceTag(instanceId)}...`)

    // A provision still retrying against the instance works for a session that no longer owns it.
    // Forgetting it first stops it before the undeploy and before the instance can reach the pool:
    // past that point it would be deleting the next session's containers, and its entry would drop
    // that session's provisioning as a duplicate.
    provisioning?.forget(instanceId)

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
            await provider.deleteScratchVolume(instanceId)
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
