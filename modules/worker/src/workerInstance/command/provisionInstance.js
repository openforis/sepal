// Retry provisioning failures with exponential backoff. Cancellation emits neither event:
// an instance may already belong to another session by the time an old operation returns.

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'
import {emitFailedToProvisionInstance, emitInstanceProvisioned} from '../events.js'

const log = getLogger('worker/provisionInstance')

const MAX_ATTEMPTS = 10
const DEFAULT_DELAY_FN = ms => new Promise(resolve => setTimeout(resolve, ms))

const provisionInstance = async (instance, {
    claims,
    provider,
    provisioner,
    isCurrent = () => true,
    prepareScratch = attach => attach(),
    _delayFn = DEFAULT_DELAY_FN,
}) => {
    log.debug(`Provisioning ${instanceTag(instance)}...`)
    return provisionWithRetries({instance, attempt: 1}, {claims, provider, provisioner, isCurrent, prepareScratch, delay: _delayFn})
}

const provisionWithRetries = async ({instance, attempt}, dependencies) => {
    const {isCurrent, delay} = dependencies
    if (!isCurrent()) {
        return abandon(instance)
    }
    try {
        const provisioned = await provisionOnce(instance, dependencies)
        if (!provisioned || !isCurrent()) {
            return abandon(instance)
        }
        emitInstanceProvisioned(instance)
        log.info(`Provisioned ${instanceTag(instance)} on attempt ${attempt}`)
    } catch (error) {
        if (!isCurrent()) {
            return abandon(instance)
        }
        if (attempt === MAX_ATTEMPTS) {
            emitFailedToProvisionInstance(instance, error)
            throw error
        }
        const retryDelay = 2 ** (attempt - 1) * 1000
        log.warn(`Provision attempt ${attempt}/${MAX_ATTEMPTS} failed for ${instanceTag(instance)}: ${error.message}. Retrying in ${retryDelay}ms`)
        await delay(retryDelay)
        return provisionWithRetries({instance, attempt: attempt + 1}, dependencies)
    }
}

const provisionOnce = async (instance, dependencies) => {
    const {provider, provisioner, isCurrent, prepareScratch} = dependencies
    const ownsInstance = await sessionStillOwnsInstance(instance, dependencies)
    if (!ownsInstance || !isCurrent()) {
        return false
    }
    const attachScratchVolume = () => isCurrent() ? prepareScratch(() => provider.attachScratchVolume(instance)) : null
    await provisioner.provisionInstance(instance, {attachScratchVolume, isCurrent})
    return isCurrent()
}

const sessionStillOwnsInstance = async (instance, {claims, provider, isCurrent}) => {
    const sessionId = instance.reservation?.sessionId ?? ''
    const claimedSessionId = await claims.sessionIdForInstance(instance.id)
    if (!isCurrent()) {
        return false
    }
    // A matching durable claim covers EC2 reservation tags that are not yet visible.
    if (claimedSessionId !== null) {
        return claimedSessionId === sessionId
    }
    const current = await provider.getInstance(instance.id)
    const reservation = current?.reservation
    if (!isCurrent() || !reservation) {
        return false
    }
    if (reservation.username !== instance.reservation?.username) {
        return false
    }
    return !reservation.sessionId || reservation.sessionId === sessionId
}

const abandon = instance =>
    log.info(`Stopped provisioning ${instanceTag(instance)} - session ${instance.reservation?.sessionId} no longer holds it`)

export {provisionInstance}
