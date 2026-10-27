// Retries up to 10 times with exponential backoff: delay = 2^attempt * 1000 ms
// (attempt 0 → 1s, 1 → 2s, 2 → 4s … 9 → 512s; ~17 min total). Success emits
// InstanceProvisioned; after 10 failures it emits FailedToProvisionInstance and rethrows the
// last error.
//
// isCurrent() — does the session this provision was started for still hold the instance? Once it
// does not, the instance may already be another session's: stop without touching it again and
// without emitting either event, since both act on whichever session is on the instance now.

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'
import {emitFailedToProvisionInstance, emitInstanceProvisioned} from '../events.js'

const log = getLogger('worker/provisionInstance')

const MAX_RETRIES = 10
const DEFAULT_DELAY_FN = ms => new Promise(resolve => setTimeout(resolve, ms))

// _delayFn is injectable so tests don't sleep through the real 17 minutes.

const provisionInstance = async (instance, {provider, provisioner, isCurrent = () => true, _delayFn = DEFAULT_DELAY_FN}) => {
    log.debug(`Provisioning ${instanceTag(instance)}...`)

    let lastError
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (!isCurrent()) {
            return abandon(instance)
        }
        try {
            const tmpDevice = await provider.attachScratchVolume(instance)
            await provisioner.provisionInstance(instance, {tmpDevice})
            if (!isCurrent()) {
                return abandon(instance)
            }
            emitInstanceProvisioned(instance)
            log.info(`Provisioned ${instanceTag(instance)} on attempt ${attempt + 1}`)
            return
        } catch (err) {
            lastError = err
            const delay = Math.pow(2, attempt) * 1000
            log.warn(`Provision attempt ${attempt + 1}/${MAX_RETRIES} failed for ${instanceTag(instance)}: ${err.message}. Retrying in ${delay}ms`)
            if (attempt < MAX_RETRIES - 1) {
                await _delayFn(delay)
            }
        }
    }

    if (!isCurrent()) {
        return abandon(instance)
    }
    emitFailedToProvisionInstance(instance, lastError)
    throw lastError
}

const abandon = instance =>
    log.info(`Stopped provisioning ${instanceTag(instance)} - session ${instance.reservation?.sessionId} no longer holds it`)

export {provisionInstance}
