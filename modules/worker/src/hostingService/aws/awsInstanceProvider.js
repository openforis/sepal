import {
    CreateTagsCommand,
    DescribeImagesCommand,
    DescribeInstancesCommand,
    EC2Client,
    RunInstancesCommand,
    TerminateInstancesCommand,
} from '@aws-sdk/client-ec2'

import {getLogger} from '#sepal/log'

import {instanceName} from '../../instanceName.js'
import {instanceTag} from '../../tag.js'
import {createWorkerInstance} from '../../workerInstance/workerInstance.js'
import {AWS_INSTANCE_TYPES} from '../instanceTypes.js'

const log = getLogger('worker/aws')

const SECURITY_GROUP = 'Sandbox'
const PUBLIC_IP_RETRIES = 300
const POLL_INTERVAL_MS = 10_000

// Compares the first run of digits in each version string as an int:
// "1.23.4" → 1, "12.0.0" → 12, "" → 0, null/undefined → 0.
const isOlderVersion = (v1, v2) => {
    const leading = v => {
        if (!v) return 0
        const m = v.match(/\d+/)
        return m ? parseInt(m[0], 10) : 0
    }
    return leading(v1) < leading(v2)
}

const mkTag = (key, value) => ({Key: key, Value: String(value)})
const mkFilter = (name, values) => ({Name: name, Values: Array.isArray(values) ? values : [values]})

// ── instance-type identifier translation ─────────────────────────────────────
// This provider's PUBLIC surface speaks catalog IDS ("T3aSmall") in both directions, because that
// is what the rest of the worker uses: worker_session.instance_type, sizeIdlePool's target map,
// dockerInstanceProvisioner's instanceTypeById lookup, and the ssh-gateway / GUI wire format all
// key on `id`. EC2 itself only understands the catalog NAME ("t3a.small"), so every value crossing
// the AWS boundary is translated here — inbound on RunInstances + the `instance-type` filter,
// outbound in toWorkerInstance.
//
// Catalog names are UNIQUE, so name → id is unambiguous and the id round-trip is total; the
// instanceTypes test asserts that invariant. Should a duplicate ever be reintroduced, name → id
// resolves first-wins in catalog order rather than throwing.
//
// Unknown values pass through untouched rather than throwing: an instance of a type no longer in
// the catalog still gets an id-shaped `type`, and the provisioner reports it as an unknown
// instance type exactly as before.
const createInstanceTypeCodec = (instanceTypes = AWS_INSTANCE_TYPES) => {
    const nameById = new Map()
    const idByName = new Map()
    for (const {id, name} of instanceTypes) {
        nameById.set(id, name)
        if (!idByName.has(name)) {
            idByName.set(name, id) // first wins
        }
    }
    return {
        // catalog id → EC2 instance-type value
        toAwsName: id => nameById.get(id) ?? id,
        // EC2 instance-type value → catalog id
        toCatalogId: name => idByName.get(name) ?? name,
    }
}

const launchTags = (environment, sepalVersion) => [
    mkTag('Environment', environment),
    mkTag('Type', 'Worker'),
    mkTag('Version', sepalVersion),
    mkTag('Starting', 'true'),
]

const idleTags = environment => [
    mkTag('State', 'idle'),
    mkTag('Username', ''),
    mkTag('WorkerType', ''),
    // InStateSince is informational only (no consumer parses it); format intentionally ISO-8601.
    mkTag('InStateSince', new Date().toISOString()),
    mkTag('Name', `${environment}: Idle worker`),
]

// The Name tag is written, never read: no filter matches on it and toWorkerInstance ignores it.
// It exists so the console's instance list — the only place an operator sees the machine — names
// it the way the user does, since a support request quotes the two-word name and nothing else.
// Free to reformat; keep it out of any lookup.
const reserveName = (environment, reservation) => {
    const name = instanceName(reservation.sessionId)
    const suffix = name ? `, ${name}` : ''
    return `${environment}: ${reservation.workerType}, ${reservation.username}${suffix}`
}

const reserveTags = (environment, reservation) => [
    mkTag('State', 'reserved'),
    mkTag('Username', reservation.username),
    mkTag('WorkerType', reservation.workerType),
    // The container is named after the session; this is the only thing that carries the session id
    // across a worker restart, since the reservation is rebuilt from these tags.
    mkTag('SessionId', reservation.sessionId ?? ''),
    // InStateSince is informational only (no consumer parses it); format intentionally ISO-8601.
    mkTag('InStateSince', new Date().toISOString()),
    mkTag('Name', reserveName(environment, reservation)),
]

const filterTaggedWith = (tagName, value) => mkFilter(`tag:${tagName}`, value)
const filterRunning = () => mkFilter('instance-state-name', 'running')
const filterPendingOrRunning = () => mkFilter('instance-state-name', ['pending', 'running'])
const filterInstanceType = instanceTypeName => mkFilter('instance-type', instanceTypeName)
const filterTypeWorker = environment => [
    filterTaggedWith('Type', 'Worker'),
    filterTaggedWith('Environment', environment),
    filterPendingOrRunning(),
]

const collectInstances = response =>
    (response.Reservations ?? []).flatMap(r => r.Instances ?? [])

const tagValue = (awsInstance, key) => {
    const tag = (awsInstance.Tags ?? []).find(t => t.Key === key)
    return tag ? tag.Value : undefined
}

const instanceVersion = awsInstance => tagValue(awsInstance, 'Version')

// `codec` translates EC2's instance-type value back to the catalog id the rest of the worker
// keys on — see createInstanceTypeCodec.
const toWorkerInstance = (awsInstance, codec) => {
    const idle = tagValue(awsInstance, 'State') === 'idle'
    const running = awsInstance.State?.Name === 'running'
    const reservation = idle ? null : {
        username: tagValue(awsInstance, 'Username') ?? '',
        workerType: tagValue(awsInstance, 'WorkerType') ?? '',
        sessionId: tagValue(awsInstance, 'SessionId') ?? null,
    }
    return createWorkerInstance({
        id: awsInstance.InstanceId,
        type: codec.toCatalogId(awsInstance.InstanceType),
        host: awsInstance.PublicIpAddress ?? null,
        running,
        launchTime: awsInstance.LaunchTime ? new Date(awsInstance.LaunchTime) : new Date(),
        reservation,
    })
}

// retry(tries, operation) — tries+1 total attempts, throwing the last error if all of them
// fail. Exponential backoff: 2^attempt seconds between attempts.
const retry = async (tries, operation) => {
    for (let attempt = 0; attempt <= tries; attempt++) {
        try {
            return await operation()
        } catch (err) {
            if (attempt < tries) {
                const millis = Math.pow(2, attempt) * 1000
                log.warn(`Retry #${attempt + 1} after exception: ${err.message}. Backing off ${millis}ms`)
                await new Promise(resolve => setTimeout(resolve, millis))
            } else {
                throw err
            }
        }
    }
}

// instanceTypes — the catalog backing the id ↔ EC2-name translation; injectable for tests.
const createAwsInstanceProvider = (config, {instanceTypes = AWS_INSTANCE_TYPES} = {}) => {
    const {
        sepalVersion,
        region,
        availabilityZone,
        environment,
        accessKey,
        secretKey,
    } = config

    const codec = createInstanceTypeCodec(instanceTypes)

    // Constructed eagerly, but no AWS call is issued until start().
    const client = new EC2Client({
        region,
        credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
        },
    })

    let imageId = null

    const launchListeners = []

    let pollTimer = null

    const fetchImageId = async () => {
        const response = await client.send(new DescribeImagesCommand({
            Filters: [
                mkFilter('tag:Version', sepalVersion),
                mkFilter('tag:Region', region),
            ],
        }))
        if (!response.Images || response.Images.length === 0) {
            throw new Error(`UnableToGetImageId: sepalVersion=${sepalVersion}, region=${region}, availabilityZone=${availabilityZone}`)
        }
        const img = response.Images[0]
        log.info(`Using sandbox image ${img.ImageId}`)
        return img.ImageId
    }

    const terminate = async instanceId => {
        log.debug(`Terminating ${instanceTag(instanceId)}...`)
        await retry(2, async () => {
            await client.send(new TerminateInstancesCommand({
                InstanceIds: [instanceId],
            }))
            log.info(`Terminated ${instanceTag(instanceId)}`)
        })
    }

    const tagInstance = async (instanceId, ...tagCollections) => {
        const tags = tagCollections.flat()
        log.debug(`Tagging ${instanceTag(instanceId)} with ${JSON.stringify(tags)}`)
        try {
            await retry(4, async () => {
                await client.send(new CreateTagsCommand({
                    Resources: [instanceId],
                    Tags: tags,
                }))
            })
        } catch (err) {
            await terminate(instanceId)
            throw new Error(`FailedToTagInstance: failed to tag instance ${instanceId} with ${JSON.stringify(tagCollections)}: ${err.message}`, {cause: err})
        }
    }

    // instanceType is a catalog ID ("T3aSmall"); EC2 needs the name ("t3a.small").
    //
    // RunInstances answers with a Reservation ITSELF, so the instances are at the top level of the
    // response; only DescribeInstances wraps them in Reservations[] (see collectInstances). And an
    // empty answer is a failed launch, not an empty fleet — left to return [], launchReserved
    // destructures undefined and the TypeError names neither EC2 nor the instance type. A SHORT
    // answer is not rejected: MinCount makes it EC2's error to raise, and throwing here would
    // discard instances it did create.
    const launch = async (instanceType, count) => {
        const awsInstanceType = codec.toAwsName(instanceType)
        log.info(`Launching ${instanceType} (${awsInstanceType})`)
        const response = await client.send(new RunInstancesCommand({
            KeyName: region,
            InstanceType: awsInstanceType,
            SecurityGroups: [SECURITY_GROUP],
            ImageId: imageId,
            MinCount: count,
            MaxCount: count,
            Placement: {AvailabilityZone: availabilityZone},
        }))
        const instances = response.Instances ?? []
        if (instances.length === 0) {
            throw new Error(`FailedToLaunchInstance: EC2 returned no instances for ${count} requested ${awsInstanceType} instance(s)`)
        }
        return instances
    }

    const findInstancesByFilters = async (onlyCorrectVersion, ...extraFilters) => {
        const filters = [...extraFilters, ...filterTypeWorker(environment)]
        return findInstancesByRequest(onlyCorrectVersion, {Filters: filters})
    }

    const findInstancesByRequest = async (onlyCorrectVersion, requestInput) => {
        const response = await client.send(new DescribeInstancesCommand(requestInput))
        const awsInstances = collectInstances(response)
        const instancesWithValidVersion = onlyCorrectVersion
            ? awsInstances.filter(i => !isOlderVersion(instanceVersion(i), sepalVersion))
            : awsInstances
        // Auto-cleanup — always baked in on every find
        await terminateOldIdle(awsInstances)
        await terminateUntagged()
        return instancesWithValidVersion.map(i => toWorkerInstance(i, codec))
    }

    // Terminates instances whose Version tag is older than sepalVersion AND State=idle.
    //
    // Auto-cleanup terminates are best-effort: a single transient failure must not abort the whole
    // findInstances result. Caller-initiated terminate() still throws on final failure so callers
    // can react; only here we catch and log.
    const terminateOldIdle = async awsInstances => {
        const old = awsInstances.filter(i =>
            isOlderVersion(instanceVersion(i), sepalVersion) &&
            tagValue(i, 'State') === 'idle'
        )
        await Promise.all(old.map(i =>
            terminate(i.InstanceId).catch(err =>
                log.warn(`Failed to terminate old idle ${instanceTag(i.InstanceId)}: ${err.message}`)
            )
        ))
    }

    // Finds running, untagged instances up >1 minute and terminates them. Same best-effort
    // semantics as terminateOldIdle: a cleanup-terminate failure is swallowed and logged so the
    // caller's query still resolves normally.
    const terminateUntagged = async () => {
        const response = await client.send(new DescribeInstancesCommand({
            Filters: [filterRunning()],
        }))
        const awsInstances = collectInstances(response)
        const now = Date.now()
        const untagged = awsInstances.filter(i => {
            const tags = i.Tags ?? []
            const untaggedFlag = tags.length === 0
            const launchTime = i.LaunchTime ? new Date(i.LaunchTime).getTime() : now
            const minutesSinceLaunched = (now - launchTime) / 60_000
            return untaggedFlag && minutesSinceLaunched > 1
        })
        await Promise.all(untagged.map(i =>
            terminate(i.InstanceId).catch(err =>
                log.warn(`Failed to terminate untagged ${instanceTag(i.InstanceId)}: ${err.message}`)
            )
        ))
    }

    // Polls getInstance up to PUBLIC_IP_RETRIES times (≤300×1s) until the host is set.
    //
    // A just-launched instance has no public IP yet, and EC2 does not always list it at all, so
    // neither a missing IP nor a failed read is an event: one line before, one when it resolves
    // either way. The last error rides on the throw — nothing else records why EC2 never answered.
    const waitForPublicIpToBecomeAvailable = async (instance, instanceTypeName, reservation) => {
        log.debug(`Waiting for public IP on ${instanceTag(instance)}, EC2 type: ${instanceTypeName}, reservation: ${JSON.stringify(reservation)}...`)
        let current = instance
        let lastError = null
        let retries = 0
        while (!current.host && retries < PUBLIC_IP_RETRIES) {
            retries++
            try {
                current = await getInstance(current.id)
            } catch (err) {
                lastError = err
            }
            await new Promise(resolve => setTimeout(resolve, 1000))
        }
        if (!current.host) {
            const cause = lastError ? `: ${lastError.message}` : ''
            throw new Error(`FailedToLaunchInstance: Unable to get public IP of instance ${instance.id}, type: ${instanceTypeName}, reservation: ${JSON.stringify(reservation)}, after ${retries} attempts${cause}`)
        }
        log.info(`Public IP ${current.host} assigned to ${instanceTag(current)}`)
        return current
    }

    // Finds running Starting=true instances, strips the Starting tag, and fires the launch listeners.
    const notifyAboutStartedInstances = async () => {
        const instances = await findInstancesByFilters(false, filterRunning(), filterTaggedWith('Starting', 'true'))
        const running = instances.filter(i => i.running)
        for (const inst of running) {
            await tagInstance(inst.id, [mkTag('Starting', '')])
            for (const listener of launchListeners) {
                try {
                    listener(inst)
                } catch (err) {
                    log.error(`Error in launch listener for ${instanceTag(inst)}`, err)
                }
            }
        }
    }

    // instanceType is a catalog ID — see createInstanceTypeCodec.
    const launchIdle = async (instanceType, count) => {
        const awsInstances = await launch(instanceType, count)
        const results = []
        for (const awsInst of awsInstances) {
            await tagInstance(awsInst.InstanceId, launchTags(environment, sepalVersion), idleTags(environment))
            results.push(toWorkerInstance(awsInst, codec))
        }
        return results
    }

    // instanceType is a catalog ID — see createInstanceTypeCodec.
    const launchReserved = async (instanceType, reservation) => {
        const [awsInst] = await launch(instanceType, 1)
        await tagInstance(awsInst.InstanceId, launchTags(environment, sepalVersion), reserveTags(environment, reservation))
        const instance = {...toWorkerInstance(awsInst, codec), reservation}
        return waitForPublicIpToBecomeAvailable(instance, instanceType, reservation)
    }

    const reserveInstance = async instance => {
        await tagInstance(instance.id, reserveTags(environment, instance.reservation))
    }

    const releaseInstance = async instanceId => {
        await tagInstance(instanceId, idleTags(environment))
    }

    // instanceType is a catalog ID; the EC2 `instance-type` filter matches on the name.
    const idleInstances = async instanceType => {
        if (instanceType !== undefined) {
            return findInstancesByFilters(
                true,
                filterTaggedWith('State', 'idle'),
                filterInstanceType(codec.toAwsName(instanceType))
            )
        }
        return findInstancesByFilters(true, filterTaggedWith('State', 'idle'))
    }

    const reservedInstances = async () =>
        findInstancesByFilters(false, filterTaggedWith('State', 'reserved'))

    const getInstance = async instanceId => {
        const response = await client.send(new DescribeInstancesCommand({
            InstanceIds: [instanceId],
        }))
        const awsInstances = collectInstances(response)
        if (awsInstances.length !== 1) {
            throw new Error(`Expected exactly one instance with id ${instanceId}, got ${awsInstances.length}`)
        }
        return toWorkerInstance(awsInstances[0], codec)
    }

    const onInstanceLaunched = listener => {
        launchListeners.push(listener)
    }

    const start = async () => {
        imageId = await fetchImageId()
        const poll = async () => {
            try {
                await notifyAboutStartedInstances()
            } catch (err) {
                log.error('Failed to notify about started instances', err)
            }
        }
        await poll()
        pollTimer = setInterval(async () => {
            await poll()
        }, POLL_INTERVAL_MS)
    }

    const stop = () => {
        if (pollTimer !== null) {
            clearInterval(pollTimer)
            pollTimer = null
        }
    }

    return {
        launchReserved,
        launchIdle,
        terminate,
        reserve: reserveInstance,
        release: releaseInstance,
        idleInstances,
        reservedInstances,
        getInstance,
        onInstanceLaunched,
        start,
        stop,
        _isOlderVersion: isOlderVersion,
        _launchTags: () => launchTags(environment, sepalVersion),
        _idleTags: () => idleTags(environment),
        _reserveTags: reservation => reserveTags(environment, reservation),
    }
}

export {
    createAwsInstanceProvider,
    createInstanceTypeCodec,
    idleTags,
    isOlderVersion,
    launchTags,
    mkFilter,
    mkTag,
    reserveTags,
}
