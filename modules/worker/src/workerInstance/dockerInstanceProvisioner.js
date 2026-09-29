// DockerInstanceProvisioner — talks to the Docker Engine REST API over plain HTTP at
//   http://{instance.host}:{dockerPort}/{dockerEntryPoint}/
// No SSH tunnel — direct TCP. Provision calls carry no short HTTP timeout (only the
// availability checks do), and the container-create body is built explicitly rather than left
// to a client library's defaults.
//
// Methods:
//   provisionInstance(instance, {tmpDevice})  — full provision sequence
//   undeploy(instance)                        — delete the worker containers and the /tmp volume
//   instanceStatus(instance)                  — liveness probe → PROVISIONED | MISSING | UNKNOWN
//   removeOrphanedContainers(liveInstanceIds) — shared-daemon sweep for leaked containers and
//                                               /tmp volumes

import {getLogger} from '#sepal/log'

import {instanceName} from '../instanceName.js'
import {containerTag, instanceTag} from '../tag.js'
import {dockerFetch} from './dockerApi.js'
import {InstanceStatus} from './instanceStatus.js'
import {createWorkerType, TMP_VOLUME_PREFIX, tmpVolumeName, WORKER_IMAGE_NAMES} from './workerTypes.js'

const log = getLogger('dockerInstanceProvisioner')

// Reserved for the host OS; not currently applied to the container body.
const _MIN_HOST_RAM_GiB = 0.3

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ORPHAN_GRACE_MS — removeOrphanedContainers keeps containers and volumes younger than this, so
// one created between the caller snapshotting live instances and the sweep listing
// the daemon is never mistaken for an orphan.
const ORPHAN_GRACE_MS = 10 * 60_000

// FORMAT_SCRIPT — run chrooted into the host: the worker images carry no mkfs.xfs, and the
// device's /dev/xvdg name is a host udev symlink that can trail the attachment. -K skips the
// discard pass on the blank volume.
const FORMAT_SCRIPT = `set -e
for _ in $(seq 60); do [ -b "$1" ] && break; sleep 1; done
mkfs.xfs -q -f -K "$1"`

// PROBE_TIMEOUT_MS — bound on each instanceStatus container inspect. Without it an unreachable
// host blocks on the OS TCP timeout while the next 1-minute sweep is already firing.
const PROBE_TIMEOUT_MS = 10_000

const createDockerInstanceProvisioner = ({config, instanceTypes, sandboxSessionApiKey, extraHosts = [], defaultDaemonHost = null, _dockerRetries = 60, _dockerRetryDelayMs = 1000}) => {
    const {dockerPort, dockerEntryPoint, dockerRegistryHost, workerAmiVersion, syslogAddress} = config

    // normalizeInstance — heal instances that arrive without daemonHost (reconstructed from
    // worker_session rows, which persist only the host alias). Local hosting sets
    // defaultDaemonHost (one shared dev daemon); on AWS it stays null and this is a no-op.
    const normalizeInstance = instance =>
        defaultDaemonHost && !instance.daemonHost
            ? {...instance, daemonHost: defaultDaemonHost}
            : instance

    const instanceTypeById = Object.fromEntries(instanceTypes.map(t => [t.id, t]))

    // baseUrl — http://{host}:{dockerPort}/{dockerEntryPoint}
    // daemonHost (local dev only): the shared dev daemon; instance.host is then a
    // per-instance network alias, not a machine running its own Docker Engine.
    const baseUrl = instance => `http://${instance.daemonHost ?? instance.host}:${dockerPort}/${dockerEntryPoint}`

    // isWorkerContainerName — recognizes SEPAL worker containers among everything else on
    // the daemon: "{image}.{username}.{instanceId}" (current) plus the legacy
    // "{username}.{image}.worker" suffix, so containers created before the rename are
    // still cleaned up (long-lived AWS instances, leftover dev containers).
    const isWorkerContainerName = name =>
        WORKER_IMAGE_NAMES.some(image => name.startsWith(`/${image}.`))
        || name.endsWith('.worker')

    // ownedByInstance — does this container belong to the given instance? The instance id is the
    // name's last segment (../containerName.js); the includes() check covers legacy names that
    // carried it elsewhere ("{instanceId}.{image}.worker").
    const ownedByInstance = (container, instanceId) =>
        (container.Names ?? []).some(name =>
            name.endsWith(`.${instanceId}`) || name.includes(instanceId))

    // deployedContainers — GET /containers/json?all=true, filtered to worker containers (5s timeout).
    const deployedContainers = async instance => {
        const data = await dockerFetch(baseUrl(instance), 'containers/json', {
            query: {all: true},
            timeoutMs: 5000,
        })
        return (data ?? []).filter(c => (c.Names ?? []).some(isWorkerContainerName))
    }

    // waitUntilDockerIsAvailable — retry GET /containers/json up to _dockerRetries×_dockerRetryDelayMs.
    // Throws DockerProvisionerError if all retries exhausted.
    // _dockerRetries/_dockerRetryDelayMs are injectable for tests (defaults: 60 retries, 1s delay).
    //
    // A booting instance refuses the connection until Docker is up, so the individual attempts are
    // the normal case, not events: one line before, one when it resolves either way. The last error
    // rides on the throw — the outer provision retry logs it, and nothing else records why the
    // daemon never answered.
    const waitUntilDockerIsAvailable = async instance => {
        log.debug(`Connecting to Docker on ${instanceTag(instance)} (up to ${_dockerRetries} attempts)...`)
        let lastError = null
        for (let i = 0; i < _dockerRetries; i++) {
            try {
                await deployedContainers(instance)
                log.info(`Successfully connected to Docker on ${instanceTag(instance)}`)
                return
            } catch (e) {
                lastError = e
                await sleep(_dockerRetryDelayMs)
            }
        }
        throw new DockerProvisionerError(instance, `Unable to connect to docker on instance: ${instance.id}, after ${_dockerRetries} attempts: ${lastError?.message}`)
    }

    const deleteContainer = async (instance, containerId) => {
        log.debug(`Deleting ${containerTag(containerId)} from ${instanceTag(instance)}...`)
        await dockerFetch(baseUrl(instance), `containers/${containerId}`, {
            method: 'DELETE',
            query: {force: true},
        })
        log.debug(`Deleted ${containerTag(containerId)} from ${instanceTag(instance)}`)
    }

    // deleteExistingContainers — delete the worker containers on the instance.
    // On a dedicated host (AWS) every worker container belongs to this instance.
    // On the shared local daemon, scope to THIS instance's containers — deleting them
    // all would tear down every other session's sandbox on the dev machine.
    const deleteExistingContainers = async instance => {
        const containers = await deployedContainers(instance)
        const instanceContainers = instance.daemonHost
            ? containers.filter(c => ownedByInstance(c, instance.id))
            : containers
        for (const c of instanceContainers) {
            await deleteContainer(instance, c.Id)
        }
    }

    // deleteTmpVolume — the instance's /tmp goes with its containers, so the next session on the
    // instance starts with an empty one. Docker refuses to remove a volume a container still uses.
    const deleteTmpVolume = async instance => {
        const name = tmpVolumeName(instance.id)
        try {
            await dockerFetch(baseUrl(instance), `volumes/${name}`, {method: 'DELETE'})
            log.debug(`Deleted volume ${name} from ${instanceTag(instance)}`)
        } catch (e) {
            if (e.statusCode !== 404) {
                throw e
            }
        }
    }

    const removeInstanceContainers = async instance => {
        await deleteExistingContainers(instance)
        await deleteTmpVolume(instance)
    }

    // createTmpVolume — an empty volume of mode 1777, on tmpDevice when there is one (the session's
    // scratch disk), formatted first. The containers mount it nocopy: Docker would otherwise fill
    // the empty volume with whatever the image's build left in /tmp.
    const createTmpVolume = async (instance, image, tmpDevice) => {
        if (tmpDevice) {
            await runHelper(instance, image, 'format-tmp', {
                Entrypoint: ['chroot', '/host', '/bin/sh', '-c', FORMAT_SCRIPT, 'format-tmp', tmpDevice],
                HostConfig: {Privileged: true, Binds: ['/:/host'], NetworkMode: 'none'},
            })
        }
        const name = tmpVolumeName(instance.id)
        await dockerFetch(baseUrl(instance), 'volumes/create', {
            method: 'POST',
            body: {
                Name: name,
                Driver: 'local',
                DriverOpts: tmpDevice ? {type: 'xfs', device: tmpDevice, o: 'noatime'} : {},
            },
        })
        await runHelper(instance, image, 'prepare-tmp', {
            Entrypoint: ['chmod', '1777', '/tmp-volume'],
            HostConfig: {Binds: [`${name}:/tmp-volume:nocopy`], NetworkMode: 'none'},
        })
        log.debug(`Created volume ${name}${tmpDevice ? ` on ${tmpDevice}` : ''} of ${instanceTag(instance)}`)
    }

    // runHelper — runs a throwaway root container of the worker image to completion. Named like a
    // worker container of the instance, so the deletes and the orphan sweep cover one left behind.
    const runHelper = async (instance, image, task, {Entrypoint, HostConfig}) => {
        const name = `${image.name}.${task}.${instance.id}`
        await dockerFetch(baseUrl(instance), 'containers/create', {
            method: 'POST',
            query: {name},
            body: {Image: imageRef(image), User: 'root', Entrypoint, Cmd: null, HostConfig},
        })
        try {
            await dockerFetch(baseUrl(instance), `containers/${name}/start`, {method: 'POST', body: {}})
            const {StatusCode} = await dockerFetch(baseUrl(instance), `containers/${name}/wait`, {method: 'POST'})
            if (StatusCode !== 0) {
                const output = await dockerFetch(baseUrl(instance), `containers/${name}/logs`, {query: {stdout: true, stderr: true}})
                throw new DockerProvisionerError(instance, `${task} failed on ${instanceTag(instance)} (exit ${StatusCode}): ${output}`)
            }
        } finally {
            await deleteContainer(instance, name)
        }
    }

    const imageRef = image => `${dockerRegistryHost}/openforis/${image.name}:${workerAmiVersion}`

    // buildContainerBody — constructs the exact Docker container-create JSON body, field by field.
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
                    'tag': 'worker-docker/{{.Name}}',
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

    const createContainer = async (instance, image, instanceType) => {
        const containerName = image.containerName(instance)
        const body = buildContainerBody(instance, image, instanceType)
        log.debug(`Creating ${containerTag(containerName)} on ${instanceTag(instance)}...`)
        const response = await dockerFetch(baseUrl(instance), 'containers/create', {
            method: 'POST',
            body,
            query: {name: containerName},
        })
        if (response?.Warnings?.length) {
            log.warn(`Warning creating ${containerTag(containerName)} on ${instanceTag(instance)}: ${JSON.stringify(response.Warnings)}`)
        }
        log.debug(`Created ${containerTag(containerName)} on ${instanceTag(instance)}`)
    }

    const startContainer = async (instance, image) => {
        const containerName = image.containerName(instance)
        log.debug(`Starting ${containerTag(containerName)} on ${instanceTag(instance)}...`)
        await dockerFetch(baseUrl(instance), `containers/${containerName}/start`, {
            method: 'POST',
            body: {},
        })
        log.debug(`Started ${containerTag(containerName)} on ${instanceTag(instance)}`)
    }

    // waitUntilInitialized — exec the image's waitCommand inside the container and wait for it to
    // exit. No timeout on the exec calls: provisioning can take minutes.
    const waitUntilInitialized = async (instance, image) => {
        const containerName = image.containerName(instance)
        log.debug(`Waiting until initialized: ${containerTag(containerName)} on ${instanceTag(instance)}...`)

        const execResponse = await dockerFetch(baseUrl(instance), `containers/${containerName}/exec`, {
            method: 'POST',
            body: {
                AttachStdin: false,
                AttachStdout: true,
                AttachStderr: true,
                Tty: false,
                Cmd: image.waitCommand,
            },
        })

        const execId = execResponse.Id
        log.debug(`Exec created: ${execId} for ${containerTag(containerName)} on ${instanceTag(instance)}`)

        await dockerFetch(baseUrl(instance), `exec/${execId}/start`, {
            method: 'POST',
            body: {Detach: false, Tty: true},
        })

        log.debug(`Initialized ${containerTag(containerName)} on ${instanceTag(instance)}`)
    }

    // provisionInstance — full provision sequence:
    //   1. waitUntilDockerIsAvailable
    //   2. removeInstanceContainers (containers and /tmp volume)
    //   3. apiKeyForInstance (with retry)
    //   4. createWorkerType → get images
    //   5. createTmpVolume, on tmpDevice when there is one (the session's scratch disk)
    //   6. for each image: createContainer, startContainer
    //   7. for each image: waitUntilInitialized
    const provisionInstance = async (rawInstance, {tmpDevice = null} = {}) => {
        const instance = normalizeInstance(rawInstance)
        log.debug(`Provisioning ${instanceTag(instance)} (workerType=${instance.reservation?.workerType})...`)
        await waitUntilDockerIsAvailable(instance)
        await removeInstanceContainers(instance)

        const apiKey = await sandboxSessionApiKey.apiKeyForInstance(instance.id)
        log.debug(`ApiKey for ${instanceTag(instance)}: ${apiKey ? '[obtained]' : '[null]'}`)

        // A worker authenticates everything it sends back to SEPAL with this key, so it is never
        // started without one. The caller's retry covers a lookup that was merely too early.
        if (!apiKey) {
            throw new DockerProvisionerError(instance, `No session api key for instance: ${instance.id}`)
        }

        const instanceType = instanceTypeById[instance.type]
        if (!instanceType) {
            throw new DockerProvisionerError(instance, `Unknown instance type: ${instance.type}`)
        }
        const workerType = createWorkerType(instance.reservation.workerType, instance, config, apiKey)
        await createTmpVolume(instance, workerType.images[0], tmpDevice)

        for (const image of workerType.images) {
            await createContainer(instance, image, instanceType)
            await startContainer(instance, image)
        }
        for (const image of workerType.images) {
            await waitUntilInitialized(instance, image)
        }
        log.info(`Provisioned ${instanceTag(instance)}`)
    }

    const undeploy = async rawInstance => {
        const instance = normalizeInstance(rawInstance)
        log.debug(`Undeploying ${instanceTag(instance)}...`)
        await removeInstanceContainers(instance)
        log.info(`Undeployed ${instanceTag(instance)}`)
    }

    // removeOrphanedContainers — delete worker containers, then their /tmp volumes, on the shared
    // local daemon that no live instance claims. Instance tracking on local hosting is in-memory,
    // so a worker restart forgets live instances; when their sessions later close,
    // releaseInstance finds nothing to undeploy and the containers leak (they are otherwise never revisited —
    // deleteExistingContainers is scoped to a single instance's names).
    // Only meaningful with defaultDaemonHost (shared daemon); on dedicated hosts (AWS) the
    // containers die with the instance, so this is a no-op there.
    // liveInstanceIds: instance ids that may legitimately own containers (open sessions +
    // every instance the provider still tracks). Ownership is decided by ownedByInstance, the
    // same test deleteExistingContainers uses.
    // Containers and volumes younger than ORPHAN_GRACE_MS are kept — they may belong to an
    // instance launched after the caller computed liveInstanceIds.
    const removeOrphanedContainers = async liveInstanceIds => {
        if (!defaultDaemonHost) {
            return []
        }
        const daemon = {id: 'shared-daemon', daemonHost: defaultDaemonHost}
        const containers = await deployedContainers(daemon)
        const minCreated = Date.now() / 1000 - ORPHAN_GRACE_MS / 1000
        const isLive = container => liveInstanceIds.some(id => ownedByInstance(container, id))
        const orphans = containers.filter(c => c.Created < minCreated && !isLive(c))
        const removed = []
        for (const c of orphans) {
            const name = (c.Names ?? [])[0] ?? c.Id
            log.warn(`Removing orphaned worker ${containerTag(name)} (${c.Id})`)
            await deleteContainer(daemon, c.Id)
            removed.push(name)
        }
        return [...removed, ...await removeOrphanedTmpVolumes(daemon, liveInstanceIds)]
    }

    const removeOrphanedTmpVolumes = async (daemon, liveInstanceIds) => {
        const data = await dockerFetch(baseUrl(daemon), 'volumes', {
            query: {filters: JSON.stringify({name: [TMP_VOLUME_PREFIX]})},
            timeoutMs: 5000,
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
            await dockerFetch(baseUrl(daemon), `volumes/${Name}`, {method: 'DELETE'})
            removed.push(Name)
        }
        return removed
    }

    // instanceStatus — liveness probe for the CloseSessionsWithoutInstance sweep. Called WITHOUT
    // an apiKey.
    //
    // Inspects each of the instance's containers (GET /containers/{name}/json, bounded by
    // PROBE_TIMEOUT_MS) and reports whether Docker CONFIRMED them, DENIED them, or could not be
    // asked. Only a denial is allowed to cost a user their session, so a 404 / not-running is
    // MISSING while every other failure is UNKNOWN.
    //
    // This replaced an exec of the image's waitCommand. That was strictly more expensive without
    // being more informative: the exec's exit code was never read (Docker returns 200 for
    // `exec/{id}/start` whatever the command does), so the old check also only ever established
    // "daemon reachable and container present" — at the cost of a netstat poll inside every
    // container of every ACTIVE session, every minute, with no timeout.
    const instanceStatus = async rawInstance => {
        const instance = normalizeInstance(rawInstance)
        try {
            const workerType = createWorkerType(instance.reservation.workerType, instance, config)
            for (const image of workerType.images) {
                const containerName = image.containerName(instance)
                const container = await dockerFetch(
                    baseUrl(instance), `containers/${containerName}/json`, {timeoutMs: PROBE_TIMEOUT_MS}
                )
                if (container?.State?.Running !== true) {
                    log.warn(`${instanceTag(instance)}: ${containerTag(containerName)} is not running`)
                    return InstanceStatus.MISSING
                }
            }
            log.debug(`${instanceTag(instance)} is provisioned`)
            return InstanceStatus.PROVISIONED
        } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 409) {
                log.warn(`${instanceTag(instance)} denied by Docker: ${e.message}`)
                return InstanceStatus.MISSING
            }
            log.warn(`${instanceTag(instance)} could not be probed: ${e.message}`)
            return InstanceStatus.UNKNOWN
        }
    }

    return {provisionInstance, undeploy, instanceStatus, removeOrphanedContainers}
}

class DockerProvisionerError extends Error {
    constructor(instance, message) {
        super(message)
        this.instance = instance
        this.name = 'DockerProvisionerError'
    }
}

export {createDockerInstanceProvisioner, DockerProvisionerError}
