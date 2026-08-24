import {createDockerInstanceProvisioner} from '../workerInstance/dockerInstanceProvisioner.js'
import {createApiKeyRetryWrapper, NULL_API_KEY_IMPL} from '../workerInstance/sandboxSessionApiKey.js'
import {createAwsInstanceProvider} from './aws/awsInstanceProvider.js'
import {AWS_INSTANCE_TYPES, LOCAL_INSTANCE_TYPES} from './instanceTypes.js'
import {createLocalInstanceProvider, LOCAL_HOST} from './local/localInstanceProvider.js'

const STORAGE_COST_PER_GB_MONTH = 0.33 // EFS pricing — matches Java AbstractHostingService

const hourlyCostByInstanceType = instanceTypes =>
    Object.fromEntries(instanceTypes.map(({id, hourlyCost}) => [id, hourlyCost]))

const createHostingService = (config, {sandboxSessionApiKey} = {}) => {
    const {hostingService} = config

    let instanceTypes
    let instanceProvider
    // extraHosts — passed to the Docker provisioner's HostConfig.ExtraHosts.
    let extraHosts = []
    // defaultDaemonHost — local only: ALL local instances live on the single dev Docker
    // daemon. The provisioner uses it to heal instances that arrive WITHOUT daemonHost
    // (e.g. reconstructed from worker_session rows, which only persist the host alias).
    let defaultDaemonHost = null
    if (hostingService === 'aws') {
        instanceTypes = AWS_INSTANCE_TYPES
        // The catalog is passed in so the provider can translate between the catalog ids the rest
        // of the worker uses and the EC2 instance-type names AWS expects.
        instanceProvider = createAwsInstanceProvider(config, {instanceTypes})
    } else if (hostingService === 'local') {
        instanceTypes = LOCAL_INSTANCE_TYPES
        // Local provider uses the first instance type with a truthy tag.
        const localInstanceType = instanceTypes.find(t => t.tag)
        instanceProvider = createLocalInstanceProvider(localInstanceType)
        // Worker containers reach SEPAL at $SEPAL_HOST, which has no DNS entry on a local dev
        // host, so pin it to the Docker host.
        extraHosts = [`${config.sepalHost}:host-gateway`]
        defaultDaemonHost = LOCAL_HOST
    } else {
        throw new Error(`Unknown hosting service: ${hostingService}`)
    }

    // Wrap the apiKey impl with 5×50ms retry.
    const resolvedApiKey = createApiKeyRetryWrapper(sandboxSessionApiKey ?? NULL_API_KEY_IMPL)
    const instanceProvisioner = createDockerInstanceProvisioner({
        config,
        instanceTypes,
        sandboxSessionApiKey: resolvedApiKey,
        extraHosts,
        defaultDaemonHost,
    })

    return {
        instanceTypes,
        hourlyCostByInstanceType: () => hourlyCostByInstanceType(instanceTypes),
        storageCostPerGbMonth: STORAGE_COST_PER_GB_MONTH,
        defaultDaemonHost,
        instanceProvider,
        instanceProvisioner,
    }
}

export {createHostingService, STORAGE_COST_PER_GB_MONTH}
