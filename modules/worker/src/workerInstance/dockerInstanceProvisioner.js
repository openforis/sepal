// Docker workflows for one worker instance. Provisioning gets an attempt-scoped client;
// teardown, probes and orphan cleanup get independent clients.

import {getLogger} from '#sepal/log'

import {instanceName} from '../instanceName.js'
import {containerTag, instanceTag} from '../tag.js'
import {dockerFetch} from './dockerApi.js'
import {InstanceStatus} from './instanceStatus.js'
import {createWorkerType, TMP_VOLUME_PREFIX, tmpVolumeName, WORKER_IMAGE_NAMES} from './workerTypes.js'

const log = getLogger('dockerInstanceProvisioner')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Keep resources launched after the caller's live-instance snapshot out of the orphan sweep.
const ORPHAN_GRACE_MS = 10 * 60_000
const PROBE_TIMEOUT_MS = 10_000

// The host provides mkfs.xfs; /dev/xvdg may appear after attachment. -K skips discard on a blank disk.
const FORMAT_SCRIPT = `set -e
for _ in $(seq 60); do [ -b "$1" ] && break; sleep 1; done
mkfs.xfs -q -f -K "$1"`

const createDockerInstanceProvisioner = ({
    config,
    instanceTypes,
    sandboxSessionApiKey,
    userPublicKeys,
    extraHosts = [],
    defaultDaemonHost = null,
    _dockerRetries = 60,
    _dockerRetryDelayMs = 1000,
}) => {
    const {dockerPort, dockerEntryPoint, dockerRegistryHost, workerAmiVersion, syslogAddress} = config
    const instanceTypeById = Object.fromEntries(instanceTypes.map(type => [type.id, type]))

    // Session rows retain the local alias, but not the address of the shared Docker daemon.
    const normalizeInstance = instance => defaultDaemonHost && !instance.daemonHost
        ? {...instance, daemonHost: defaultDaemonHost}
        : instance

    const provisionInstance = async (rawInstance, {tmpDevice = null, isCurrent = () => true} = {}) => {
        const instance = normalizeInstance(rawInstance)
        const docker = createInstanceDocker({instance, isCurrent})
        log.debug(`Provisioning ${instanceTag(instance)} (workerType=${instance.reservation?.workerType})...`)

        await docker.waitUntilAvailable()
        const {instanceType, images} = await loadWorkerDefinition(instance)
        await docker.removeSandbox()
        await docker.prepareTmp({image: images[0], tmpDevice})

        for (const image of images) {
            await docker.createContainer({image, instanceType})
            await docker.startContainer(image)
        }
        for (const image of images) {
            await docker.waitUntilInitialized(image)
        }
    }

    const loadWorkerDefinition = async instance => {
        const instanceType = instanceTypeById[instance.type]
        if (!instanceType) {
            throw new DockerProvisionerError(instance, `Unknown instance type: ${instance.type}`)
        }
        const apiKey = await sandboxSessionApiKey.apiKeyForSession(instance.id, instance.reservation?.sessionId)
        // Resolve and validate credentials before deleting the existing sandbox.
        if (!apiKey) {
            throw new DockerProvisionerError(instance, `No session api key for instance: ${instance.id}`)
        }
        const userPublicKey = await userPublicKeys.publicKey(instance.reservation.username)
        const {images} = createWorkerType(instance.reservation.workerType, instance, config, {apiKey, userPublicKey})
        return {instanceType, images}
    }

    const undeploy = async (rawInstance, {isCurrent} = {}) => {
        const instance = normalizeInstance(rawInstance)
        log.debug(`Undeploying ${instanceTag(instance)}...`)
        await createInstanceDocker({instance, isCurrent}).removeSandbox()
        log.info(`Undeployed ${instanceTag(instance)}`)
    }

    const instanceStatus = async rawInstance => {
        const instance = normalizeInstance(rawInstance)
        const docker = createInstanceDocker({instance})
        try {
            const {images} = createWorkerType(instance.reservation.workerType, instance, config)
            for (const image of images) {
                const containerName = image.containerName(instance)
                const container = await docker.inspectContainer(containerName)
                if (container?.State?.Running !== true) {
                    log.warn(`${instanceTag(instance)}: ${containerTag(containerName)} is not running`)
                    return InstanceStatus.MISSING
                }
            }
            return InstanceStatus.PROVISIONED
        } catch (error) {
            // Only an authoritative denial may close a user's session.
            if (error.statusCode === 404 || error.statusCode === 409) {
                log.warn(`${instanceTag(instance)} denied by Docker: ${error.message}`)
                return InstanceStatus.MISSING
            }
            log.warn(`${instanceTag(instance)} could not be probed: ${error.message}`)
            return InstanceStatus.UNKNOWN
        }
    }

    const removeOrphanedContainers = async liveInstanceIds => {
        if (!defaultDaemonHost) {
            return []
        }
        const docker = createInstanceDocker({instance: {id: 'shared-daemon', daemonHost: defaultDaemonHost}})
        const containers = await docker.listWorkerContainers()
        const minCreated = Date.now() / 1000 - ORPHAN_GRACE_MS / 1000
        const orphans = containers.filter(container =>
            container.Created < minCreated && !liveInstanceIds.some(id => ownedByInstance(container, id))
        )
        const removed = []
        for (const container of orphans) {
            const name = (container.Names ?? [])[0] ?? container.Id
            log.warn(`Removing orphaned worker ${containerTag(name)} (${container.Id})`)
            await docker.deleteContainer(container.Id)
            removed.push(name)
        }
        return [...removed, ...await docker.removeOrphanedTmpVolumes(liveInstanceIds)]
    }

    const createInstanceDocker = ({instance, isCurrent = () => true}) => {
        const url = `http://${instance.daemonHost ?? instance.host}:${dockerPort}/${dockerEntryPoint}`
        const ensureCurrent = () => {
            if (!isCurrent()) {
                throw new ProvisioningCanceled()
            }
        }
        // No next request or late successful response may escape a canceled provisioning attempt.
        const request = async (path, options) => {
            ensureCurrent()
            try {
                return await dockerFetch(url, path, options)
            } finally {
                ensureCurrent()
            }
        }

        const listWorkerContainers = async () => {
            const containers = await request('containers/json', {query: {all: true}, timeoutMs: 5000})
            return (containers ?? []).filter(container => (container.Names ?? []).some(isWorkerContainerName))
        }

        const waitUntilAvailable = async () => {
            log.debug(`Connecting to Docker on ${instanceTag(instance)} (up to ${_dockerRetries} attempts)...`)
            let lastError
            for (let attempt = 0; attempt < _dockerRetries; attempt++) {
                try {
                    await listWorkerContainers()
                    log.info(`Successfully connected to Docker on ${instanceTag(instance)}`)
                    return
                } catch (error) {
                    if (error instanceof ProvisioningCanceled) {
                        throw error
                    }
                    lastError = error
                    await sleep(_dockerRetryDelayMs)
                }
            }
            throw new DockerProvisionerError(instance, `Unable to connect to docker on instance: ${instance.id}, after ${_dockerRetries} attempts: ${lastError?.message}`)
        }

        const deleteContainer = async containerId => {
            log.debug(`Deleting ${containerTag(containerId)} from ${instanceTag(instance)}...`)
            await request(`containers/${containerId}`, {method: 'DELETE', query: {force: true}})
            log.debug(`Deleted ${containerTag(containerId)} from ${instanceTag(instance)}`)
        }

        const deleteTmpVolume = async () => {
            const name = tmpVolumeName(instance.id)
            try {
                await request(`volumes/${name}`, {method: 'DELETE'})
                log.debug(`Deleted volume ${name} from ${instanceTag(instance)}`)
            } catch (error) {
                if (error.statusCode !== 404) {
                    throw error
                }
            }
        }

        const removeSandbox = async () => {
            const containers = await listWorkerContainers()
            // AWS has a dedicated daemon; local development shares one across all instances.
            const owned = instance.daemonHost
                ? containers.filter(container => ownedByInstance(container, instance.id))
                : containers
            for (const container of owned) {
                await deleteContainer(container.Id)
            }
            await deleteTmpVolume()
        }

        const prepareTmp = async ({image, tmpDevice}) => {
            if (tmpDevice) {
                await runHelper({
                    image, task: 'format-tmp',
                    Entrypoint: ['chroot', '/host', '/bin/sh', '-c', FORMAT_SCRIPT, 'format-tmp', tmpDevice],
                    HostConfig: {Privileged: true, Binds: ['/:/host'], NetworkMode: 'none'},
                })
            }
            const name = tmpVolumeName(instance.id)
            await request('volumes/create', {
                method: 'POST',
                body: {
                    Name: name,
                    Driver: 'local',
                    DriverOpts: tmpDevice ? {type: 'xfs', device: tmpDevice, o: 'noatime'} : {},
                },
            })
            await runHelper({
                image, task: 'prepare-tmp',
                Entrypoint: ['chmod', '1777', '/tmp-volume'],
                HostConfig: {Binds: [`${name}:/tmp-volume:nocopy`], NetworkMode: 'none'},
            })
            log.debug(`Created volume ${name}${tmpDevice ? ` on ${tmpDevice}` : ''} of ${instanceTag(instance)}`)
        }

        const runHelper = async ({image, task, Entrypoint, HostConfig}) => {
            // Instance-scoped names also let ordinary teardown and orphan cleanup find leftovers.
            const name = `${image.name}.${task}.${instance.id}`
            await request('containers/create', {
                method: 'POST', query: {name},
                body: {Image: imageRef(image), User: 'root', Entrypoint, Cmd: null, HostConfig},
            })
            try {
                await request(`containers/${name}/start`, {method: 'POST', body: {}})
                const {StatusCode} = await request(`containers/${name}/wait`, {method: 'POST'})
                if (StatusCode !== 0) {
                    const output = await request(`containers/${name}/logs`, {query: {stdout: true, stderr: true}})
                    throw new DockerProvisionerError(instance, `${task} failed on ${instanceTag(instance)} (exit ${StatusCode}): ${output}`)
                }
            } finally {
                await deleteContainer(name)
            }
        }

        const createContainer = async ({image, instanceType}) => {
            const containerName = image.containerName(instance)
            log.debug(`Creating ${containerTag(containerName)} on ${instanceTag(instance)}...`)
            const response = await request('containers/create', {
                method: 'POST', query: {name: containerName},
                body: buildContainerBody(instance, image, instanceType),
            })
            if (response?.Warnings?.length) {
                log.warn(`Warning creating ${containerTag(containerName)} on ${instanceTag(instance)}: ${JSON.stringify(response.Warnings)}`)
            }
            log.debug(`Created ${containerTag(containerName)} on ${instanceTag(instance)}`)
        }

        const startContainer = async image => {
            const name = image.containerName(instance)
            await request(`containers/${name}/start`, {method: 'POST', body: {}})
        }

        const waitUntilInitialized = async image => {
            const name = image.containerName(instance)
            log.debug(`Waiting until initialized: ${containerTag(name)} on ${instanceTag(instance)}...`)
            const {Id} = await request(`containers/${name}/exec`, {
                method: 'POST',
                body: {AttachStdin: false, AttachStdout: true, AttachStderr: true, Tty: false, Cmd: image.waitCommand},
            })
            await request(`exec/${Id}/start`, {method: 'POST', body: {Detach: false, Tty: true}})
            log.debug(`Initialized ${containerTag(name)} on ${instanceTag(instance)}`)
        }

        const inspectContainer = name => request(`containers/${name}/json`, {timeoutMs: PROBE_TIMEOUT_MS})

        const removeOrphanedTmpVolumes = async liveInstanceIds => {
            const data = await request('volumes', {
                query: {filters: JSON.stringify({name: [TMP_VOLUME_PREFIX]})}, timeoutMs: 5000,
            })
            const minCreated = Date.now() - ORPHAN_GRACE_MS
            const orphans = (data?.Volumes ?? []).filter(({Name, CreatedAt}) =>
                Name.startsWith(TMP_VOLUME_PREFIX)
                && !liveInstanceIds.some(id => Name === tmpVolumeName(id))
                && Date.parse(CreatedAt) < minCreated
            )
            const removed = []
            for (const {Name} of orphans) {
                log.warn(`Removing orphaned worker volume ${Name}`)
                await request(`volumes/${Name}`, {method: 'DELETE'})
                removed.push(Name)
            }
            return removed
        }

        return {
            waitUntilAvailable, removeSandbox, prepareTmp, createContainer, startContainer,
            waitUntilInitialized, inspectContainer, listWorkerContainers, deleteContainer, removeOrphanedTmpVolumes,
        }
    }

    const isWorkerContainerName = name => WORKER_IMAGE_NAMES.some(image => name.startsWith(`/${image}.`))
        || name.endsWith('.worker')

    const ownedByInstance = (container, instanceId) => (container.Names ?? []).some(name =>
        name.endsWith(`.${instanceId}`) || name.includes(instanceId)
    )

    const imageRef = image => `${dockerRegistryHost}/openforis/${image.name}:${workerAmiVersion}`

    const buildContainerBody = (instance, image, instanceType) => {
        const shmSize = Math.floor(instanceType.ramBytes / 2)
        const tmpfsSize = Math.floor(instanceType.ramBytes / 2)

        // Binds: flatten the volume map to ["hostPath:containerPath", ...].
        const binds = Object.entries(image.volumes).flatMap(([hostDir, mountedDirs]) => {
            const dirs = Array.isArray(mountedDirs) ? mountedDirs : [mountedDirs]
            return dirs.map(dir => `${hostDir}:${dir}`)
        })

        // PortBindings: {"80/tcp": [{HostPort: "8080"}], ...}
        // On the shared local daemon (daemonHost set) publishing is skipped — concurrent
        // instances would collide on the host ports; traffic reaches the container via
        // its per-instance network alias (instance.host) on the sepal network instead.
        const portBindings = instance.daemonHost
            ? {}
            : Object.fromEntries(
                Object.entries(image.publishedPorts).map(([hostPort, containerPort]) =>
                    [`${containerPort}/tcp`, [{HostPort: `${hostPort}`}]]
                )
            )

        const exposedPorts = Object.fromEntries(
            image.exposedPorts.map(port => [`${port}/tcp`, {}])
        )

        const links = Object.entries(image.links).map(([name, alias]) => `${name}:${alias}`)

        const devices = (instanceType.devices ?? []).map(d => ({
            PathOnHost: d,
            PathInContainer: d,
            CgroupPermissions: 'mrw',
        }))

        const logConfig = syslogAddress
            ? {
                Type: 'syslog',
                Config: {
                    'syslog-address': syslogAddress,
                    'tag': `sandbox/${instance.reservation.username}/${instanceName(instance.reservation.sessionId)}`,
                },
            }
            : null

        // SEPAL_INSTANCE_TYPE: shown in the sandbox prompt, as the GUI shows the type.
        const env = Object.entries({
            ...image.environment,
            SEPAL_INSTANCE_TYPE: instanceType.tag ?? instanceType.name,
        }).map(([k, v]) => `${k}=${v}`)

        // Hostname: the sandbox prompt is "{hostname}({instance type}):{dir}$", so this is the name
        // a user reads to tell one open terminal from another — the same two-word name the GUI, the
        // SSH menu and the container itself carry, rather than the container id Docker defaults to.
        const body = {
            Image: imageRef(image),
            Hostname: instanceName(instance.reservation.sessionId),
            Tty: true,
            Cmd: image.runCommand,
            HostConfig: {
                Binds: binds,
                PortBindings: portBindings,
                Links: links,
                Tmpfs: {'/ram': `rw,exec,nosuid,size=${tmpfsSize}`},
                LogConfig: logConfig,
                ExtraHosts: extraHosts,
                Devices: devices,
                ShmSize: shmSize,
            },
            NetworkingConfig: {
                EndpointsConfig: {
                    // On the shared local daemon, alias the container as instance.host so
                    // the gateway/ssh-gateway/terminal reach it over the sepal network
                    // (ports aren't host-published there — see portBindings above).
                    sepal: instance.daemonHost ? {Aliases: [instance.host]} : {},
                },
            },
            ExposedPorts: exposedPorts,
            Env: env,
        }

        return body
    }

    return {provisionInstance, undeploy, instanceStatus, removeOrphanedContainers}
}

class ProvisioningCanceled extends Error {
    constructor() {
        super('Provisioning was canceled')
        this.name = 'ProvisioningCanceled'
    }
}

class DockerProvisionerError extends Error {
    constructor(instance, message) {
        super(message)
        this.instance = instance
        this.name = 'DockerProvisionerError'
    }
}

export {createDockerInstanceProvisioner, DockerProvisionerError}
