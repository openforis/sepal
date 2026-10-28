// Probes each instance and returns the ones that did NOT come back PROVISIONED, each paired with
// its verdict: {instance, status} where status is MISSING (Docker denied it) or UNKNOWN (the probe
// could not reach a verdict). The caller must keep the two apart — only MISSING is evidence that
// an instance is gone. The probes run in parallel.

import {getLogger} from '#sepal/log'

import {InstanceStatus} from '../instanceStatus.js'

const log = getLogger('worker/findMissingInstances')

const findMissingInstances = async (instances, {provisioner}) => {
    log.debug(`Probing ${instances.length} instance(s)`)

    const results = await Promise.all(
        instances.map(async instance => ({
            instance,
            status: await provisioner.instanceStatus(instance),
        }))
    )

    const missing = results.filter(({status}) => status !== InstanceStatus.PROVISIONED)

    log.debug(`${missing.length} of ${instances.length} not confirmed`)
    return missing
}

export {findMissingInstances}
