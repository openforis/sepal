// Retries up to 10 times with exponential backoff: delay = 2^attempt * 1000 ms
// (attempt 0 → 1s, 1 → 2s, 2 → 4s … 9 → 512s; ~17 min total). Success emits
// InstanceProvisioned; after 10 failures it emits FailedToProvisionInstance and rethrows the
// last error.

import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'
import {emitFailedToProvisionInstance, emitInstanceProvisioned} from '../events.js'

const log = getLogger('worker/provisionInstance')

const MAX_RETRIES = 10
const DEFAULT_DELAY_FN = ms => new Promise(resolve => setTimeout(resolve, ms))

// _delayFn is injectable so tests don't sleep through the real 17 minutes.

const provisionInstance = async (instance, {provisioner, _delayFn = DEFAULT_DELAY_FN}) => {
    log.debug(`Provisioning ${instanceTag(instance)}...`)

    let lastError
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            await provisioner.provisionInstance(instance)
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

    emitFailedToProvisionInstance(instance, lastError)
    throw lastError
}

export {provisionInstance}
