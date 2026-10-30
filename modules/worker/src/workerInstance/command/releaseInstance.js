// ReleaseInstance — releases the instance from ONE session; the instance may since have moved on.
//   1. provider.getInstance(instanceId) — if null, drop the session's orphaned claim and return.
//   2. Not reserved for the session (idle, or reserved by the next one) → drop the session's
//      claim and return: whoever released it before already tore it down.
//   3. forget any in-flight provisioning.
//   4. instance.host set → provisioner.undeploy(instance), then provider.deleteScratchVolume.
//   5. claims.release(instanceId, sessionId) — cleanup, not an election: the claim outlives the
//      container, never the other way round.
//   6. provider.release(instanceId) → emit InstanceReleased(release(instance)).
//   7. On ANY exception → emit FailedToReleaseInstance, terminate the instance (swallowing its
//      own errors), then claims.release(instanceId, sessionId).

import {getLogger} from '#sepal/log'

import {instanceTag, sessionTag} from '../../tag.js'
import {
    emitFailedToReleaseInstance,
    emitInstanceReleased,
} from '../events.js'
import {release} from '../workerInstance.js'

const log = getLogger('worker/releaseInstance')

// releasing — the releases in flight in this process. Stop and ReclaimStaleClaims both release a
// closed session's instance; side by side, both passed the ownership check, and the slower one
// re-tagged the instance idle after the next session had reserved it. A second caller joins the
// release in flight instead. Every release path shares the instance manager's map; without one,
// nothing is joined.
//
// provisioning is optional: callers that never provision have nothing to forget.
const releaseInstance = (instanceId, sessionId, {releasing = new Map(), ...deps}) => {
    const key = `${instanceId}/${sessionId}`
    if (!releasing.has(key)) {
        releasing.set(key, releaseFromSession(instanceId, sessionId, deps).finally(() => releasing.delete(key)))
    }
    return releasing.get(key)
}

const releaseFromSession = async (instanceId, sessionId, {claims, provider, provisioner, provisioning}) => {
    log.debug(`Releasing ${instanceTag(instanceId)} from ${sessionTag(sessionId)}...`)

    let instance
    try {
        instance = await provider.getInstance(instanceId)
        if (!instance) {
            log.warn(`${instanceTag(instanceId)} not found in provider - nothing to release`)
            await claims.release(instanceId, sessionId)
            return
        }
        if (!isReservedFor(instance, sessionId)) {
            log.debug(`${instanceTag(instanceId)} is no longer reserved for ${sessionTag(sessionId)} - left alone`)
            await claims.release(instanceId, sessionId)
            return
        }

        // A provision still retrying against the instance works for a session that no longer owns
        // it. Forgetting it before the undeploy stops it before the instance can reach the pool:
        // past that point it would be deleting the next session's containers, and its entry would
        // drop that session's provisioning as a duplicate.
        provisioning?.forget(instanceId)

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
        await claims.release(instanceId, sessionId)

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
            await claims.release(instanceId, sessionId)
        } catch (termErr) {
            log.error(`Failed to release claim for ${instanceTag(instanceId)} during error recovery: ${termErr.message}`)
        }
    }
}

// A reservation without a session id predates the SessionId tag, or reads back as the empty value
// EC2 still reports for tags written moments ago: it cannot be told apart, so it counts as the
// session's.
const isReservedFor = (instance, sessionId) =>
    !!instance.reservation && (!instance.reservation.sessionId || instance.reservation.sessionId === sessionId)

export {releaseInstance}
