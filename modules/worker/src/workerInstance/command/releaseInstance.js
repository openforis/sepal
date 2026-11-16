import {getLogger} from '#sepal/log'

import {instanceTag, sessionTag} from '../../tag.js'
import {
    emitFailedToReleaseInstance,
    emitInstanceReleased,
} from '../events.js'
import {release} from '../workerInstance.js'

const log = getLogger('worker/releaseInstance')

// Stop and reconciliation share this map so duplicate releases join instead of racing reuse.
const releaseInstance = (instanceId, sessionId, {releasing = new Map(), ...deps}) => {
    sessionId = sessionId ?? ''
    return coordinateRelease({instanceId, sessionId, releasing}, () => releaseFromSession(instanceId, sessionId, deps))
        .catch(error => reportReleaseFailure({instanceId, error}))
}

const releaseGoneClaim = (instanceId, sessionId, {claims, provisioning, releasing = new Map()}) => {
    sessionId = sessionId ?? ''
    return coordinateRelease({instanceId, sessionId, releasing}, async () => {
        const releaseToken = provisioning?.beginRelease(instanceId, sessionId)
        await claims.release(instanceId, sessionId)
        finishRelease({instanceId, provisioning, releaseToken})
    })
}

const coordinateRelease = ({instanceId, sessionId, releasing}, operation) => {
    const key = `${instanceId}/${sessionId}`
    if (!releasing.has(key)) {
        const pendingRelease = operation().finally(() => releasing.delete(key))
        releasing.set(key, pendingRelease)
    }
    return releasing.get(key)
}

const releaseFromSession = async (instanceId, sessionId, deps) => {
    log.debug(`Releasing ${instanceTag(instanceId)} from ${sessionTag(sessionId)}...`)
    const {provisioning, retire = false} = deps
    const releaseToken = provisioning?.beginRelease(instanceId, sessionId, {retire})
    const requiresRetirement = retire || releaseToken?.retire
    const options = {...deps, instanceId, sessionId, releaseToken, requiresRetirement}
    const instance = await findReleaseTarget(options).catch(error => {
        reportReleaseFailure({instanceId, error})
        if (releaseToken?.isCurrent()) {
            releaseToken.missingSince = null
        }
        if (!releaseToken?.retire) {
            finishRelease(options)
        }
        return null
    })
    if (!instance) {
        return
    }
    // Ownership reads may finish after this release gate was replaced.
    if (releaseToken && !releaseToken.isCurrent()) {
        return
    }

    if (requiresRetirement || !instance.running) {
        await retireOwnedInstance({...options, instance})
    } else {
        await reuseOwnedInstance({...options, instance})
    }
}

const findReleaseTarget = async options => {
    const {instanceId, sessionId, claims, provider, provisioning, releaseToken} = options
    if (provisioning && !releaseToken) {
        await claims.release(instanceId, sessionId)
        return null
    }
    const instance = await provider.getInstance(instanceId)
    if (instance && releaseToken?.isCurrent()) {
        releaseToken.missingSince = null
    }
    if (!instance) {
        log.warn(`${instanceTag(instanceId)} not found in provider - nothing to release`)
        await claims.release(instanceId, sessionId)
        finishRelease(options)
        return null
    }
    const claimedSessionId = await claims.sessionIdForInstance(instanceId)
    if (claimedSessionId !== null && claimedSessionId !== sessionId) {
        await claims.release(instanceId, sessionId)
        finishRelease(options)
        return null
    }
    const mayRelease = await claimReleaseAuthority({...options, instance, claimedSessionId})
    return mayRelease ? instance : null
}

const claimReleaseAuthority = async options => {
    const {instanceId, sessionId, claims, instance, claimedSessionId, requiresRetirement} = options
    // Retry a partially completed release only while its durable claim still belongs to this session.
    const canResumeRetirement = requiresRetirement
        && claimedSessionId === sessionId
        && !instance.reservation
    if (!isReservedFor(instance, sessionId) && !canResumeRetirement) {
        if (claimedSessionId === sessionId) {
            log.warn(`${instanceTag(instanceId)} reservation contradicts its claim for ${sessionTag(sessionId)} - keeping protection for retry`)
            return false
        }
        log.debug(`${instanceTag(instanceId)} is no longer reserved for ${sessionTag(sessionId)} - left alone`)
        finishRelease(options)
        await claims.release(instanceId, sessionId)
        return false
    }
    if (claimedSessionId === null && !await claims.claim(instanceId, sessionId)) {
        finishRelease(options)
        return false
    }
    return true
}

const retireOwnedInstance = async options => {
    const {instanceId, instance, provider, provisioner, releaseToken} = options
    const isCurrent = releaseToken?.isCurrent ?? (() => true)
    try {
        // Docker may still be executing an old request; this host cannot return to the pool.
        await provider.terminate(instanceId)
        if (!isCurrent()) {
            return
        }
        if (instance.daemonHost) {
            provisioner.undeploy(instance, {isCurrent}).catch(error =>
                log.warn(`Cleanup of retired local ${instanceTag(instanceId)} failed: ${error.message}`)
            )
        }
        // Termination acceptance is not completion; reconciliation owns claim/gate removal.
        emitInstanceReleased(release(instance))
    } catch (error) {
        await terminateAfterFailure({...options, error})
    }
}

const reuseOwnedInstance = async options => {
    const {instanceId, instance, provider, provisioner, releaseToken} = options
    const isCurrent = releaseToken?.isCurrent ?? (() => true)
    try {
        if (instance.host) {
            await provisioner.undeploy(instance, {isCurrent})
            if (!isCurrent()) {
                return
            }
            await provider.deleteScratchVolume(instanceId)
        }
        if (!isCurrent()) {
            return
        }
        await provider.release(instanceId)
    } catch (error) {
        await terminateAfterFailure({...options, error})
        return
    }
    if (!isCurrent()) {
        return
    }
    // From here a committed DELETE can admit the next owner; failures must never terminate.
    await completeRelease(options)
}

const completeRelease = async options => {
    const {instanceId, sessionId, instance, claims} = options
    try {
        await claims.release(instanceId, sessionId)
        finishRelease(options)
        emitInstanceReleased(release(instance))
        log.info(`Released ${instanceTag(instanceId)}`)
    } catch (error) {
        reportReleaseFailure({instanceId, error})
        finishRelease(options)
    }
}

const finishRelease = ({instanceId, provisioning, releaseToken}) => {
    if (releaseToken) {
        provisioning.finishRelease(instanceId, releaseToken)
    }
}

const reportReleaseFailure = ({instanceId, error}) => {
    emitFailedToReleaseInstance(instanceId, error)
    log.error(`Failed to release ${instanceTag(instanceId)}: ${error.message}`)
}

const terminateAfterFailure = async ({instanceId, provider, releaseToken, error}) => {
    reportReleaseFailure({instanceId, error})
    if (releaseToken && !releaseToken.isCurrent()) {
        return
    }
    try {
        await provider.terminate(instanceId)
    } catch (terminationError) {
        log.error(`Failed to terminate ${instanceTag(instanceId)} during error recovery: ${terminationError.message}`)
    }
    // Keep the claim and gate for reconciliation even after termination is accepted.
}

// Missing/empty SessionId covers both legacy reservations and EC2 tag reads that lag writes.
const isReservedFor = (instance, sessionId) =>
    !!instance.reservation && (!instance.reservation.sessionId || instance.reservation.sessionId === sessionId)

export {releaseGoneClaim, releaseInstance}
