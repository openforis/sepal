// WorkerTypes — container specs for the SANDBOX worker type.
//
// containerName(instance) comes from ../containerName.js, which needs both the session id the
// two-word name derives from (carried on the reservation) and the instance id.

import fs from 'node:fs'

import {containerName} from '../containerName.js'

const SANDBOX = 'sandbox'
const USER_HOME_NAME = 'sepal-user'

const TMP_VOLUME_PREFIX = 'sepal-tmp.'

// The instance's /tmp is a Docker volume, created by the provisioner and removed with the
// instance's containers: on the session's scratch device when there is one, otherwise under
// Docker's volume directory, which the worker AMI puts on local SSDs.
const tmpVolumeName = instanceId => `${TMP_VOLUME_PREFIX}${instanceId}`

// nocopy: a session's /tmp starts empty, not with what the image's build left there.
const tmpMounts = ['/tmp:nocopy', '/var/tmp:nocopy', `/home/${USER_HOME_NAME}/tmp:nocopy`]

// WORKER_IMAGE_NAMES — every image name a worker instance can run; the provisioner uses
// these to recognize SEPAL worker containers among everything else on a (shared) daemon.
const WORKER_IMAGE_NAMES = ['sandbox']

const DATA_CACHE_VOLUME_PREFIX = 'sepal-data-cache.'

const dataCacheVolumeName = instanceId => `${DATA_CACHE_VOLUME_PREFIX}${instanceId}`

const dataMountDir = (config, instanceId) => `${config.dataMountRoot}/${instanceId}`

// Bound read-only at ~/data instead of the mount when the mount failed. Beside the mount, so the unmount removes it too.
const dataUnavailableDir = (config, instanceId) => `${dataMountDir(config, instanceId)}/unavailable`

const DATA_MOUNT_SIDECAR = 'sandbox.data-mount'

// Usernames cannot contain '-', so this never collides with a sandbox's "sandbox.{username}.…" name,
// yet still has the "sandbox." prefix and ".{instanceId}" suffix the daemon-wide lookups match on.
const sidecarContainerName = instance => containerName({
    image: DATA_MOUNT_SIDECAR,
    username: instance.reservation.username,
    sessionId: instance.reservation.sessionId,
    instanceId: instance.id,
})

const makeImage = ({
    name,
    exposedPorts = [],
    publishedPorts = {},
    volumes = {},
    dataVolumes = {},
    links = {},
    environment = {},
    runCommand = [],
    waitCommand = [],
    containerName: nameOf = null,
    hostConfig = {},
    networkAlias = true,
    essential = true,
    tmpfs = true,
}) => ({
    name,
    exposedPorts,
    publishedPorts,
    volumes,
    dataVolumes,
    links,
    environment,
    runCommand,
    waitCommand,
    hostConfig,
    networkAlias,
    essential,
    tmpfs,
    containerName: nameOf ?? (instance => containerName({
        image: name,
        username: instance.reservation.username,
        sessionId: instance.reservation.sessionId,
        instanceId: instance.id,
    })),
})

// withDataUnavailable — the image as it starts when the Data mount failed: ~/data is the empty, read-only
// dataUnavailableDir, so writes fail instead of landing in the user's home or in the unmounted host directory.
const withDataUnavailable = (image, config, instanceId) => ({
    ...image,
    dataVolumes: Object.fromEntries(Object.values(image.dataVolumes).map(target =>
        [dataUnavailableDir(config, instanceId), `${target.split(':')[0]}:ro`]
    )),
})

// publishedPorts is {hostPort: containerPort}; the waitCommand covers sshd only.
const createSandboxWorkerType = (instance, config, apiKey, data) => {
    const username = instance.reservation.username
    const userHome = `${config.sepalHostDataDir}/sepal/home/${username}`
    const pubKeyPath = `/var/lib/sepal/user/home/${username}/.ssh/id_rsa.pub`
    // No .trim(): the raw file contents, trailing newline included.
    const userPublicKey = fs.readFileSync(pubKeyPath, 'utf8')

    const publishedPorts = {222: 22, 8787: 8787, 3838: 3838, 8888: 8888}
    // Only sshd is started at boot. rstudio/shiny/jupyter are started on first use
    // (sandboxServerManager), so waiting for their ports here would reinstate the very delay
    // this removes — the terminal must not wait for Jupyter.
    const waitPorts = '22'

    const sandbox = makeImage({
        name: 'sandbox',
        exposedPorts: [22, 8787, 3838, 8888],
        publishedPorts,
        volumes: {
            [`${config.sepalHostDataDir}/sepal/shiny`]: '/shiny',
            [`${config.sepalHostDataDir}/sepal/shared`]: `/home/${USER_HOME_NAME}/shared`,
            [`${config.sepalHostDataDir}/sepal/jupyter/current-kernels`]: '/usr/local/share/jupyter/kernels/',
            [userHome]: `/home/${USER_HOME_NAME}`,
            [tmpVolumeName(instance.id)]: tmpMounts,
        },
        dataVolumes: {
            [`${dataMountDir(config, instance.id)}/data`]: `/home/${USER_HOME_NAME}/data:rslave`,
        },
        environment: {
            USER_PUBLIC_KEY: userPublicKey,
            SEPAL_API_KEY: apiKey ?? '',
            SEPAL_HOST: config.sepalHost,
            CARTODB_BASEMAP_KEY: config.cartoDbBasemapKey ?? '',
            NVIDIA_VISIBLE_DEVICES: 'all',
            NVIDIA_DRIVER_CAPABILITIES: 'all',
        },
        runCommand: ['/script/init_container.sh'],
        waitCommand: ['/script/wait_until_initialized.sh', waitPorts],
    })

    // The sidecar comes first: its mount has to exist before the sandbox binds it.
    return {
        id: SANDBOX,
        images: [createDataMountSidecar(instance, config, apiKey, data), sandbox],
    }
}

// Same image as the sandbox, so it needs no pull of its own. Not part of instance liveness
// (essential: false): a failed mount must never fail the session.
const createDataMountSidecar = (instance, config, apiKey, data) => makeImage({
    name: 'sandbox',
    containerName: sidecarContainerName,
    volumes: {
        [dataMountDir(config, instance.id)]: '/mnt/host:rshared',
        [dataCacheVolumeName(instance.id)]: '/cache',
    },
    environment: {
        SEPAL_API_KEY: apiKey ?? '',
        SEPAL_HOST: config.sepalHost,
        DATA_UID: data?.uid ?? '',
        DATA_GID: data?.gid ?? '',
        DATA_CACHE_MAX_SIZE: config.dataCacheMaxSize,
        DATA_MOUNT_POINT: '/mnt/host/data',
    },
    runCommand: ['/usr/local/bin/sepal-data', 'mount'],
    waitCommand: ['/usr/local/bin/sepal-data', 'wait-mounted', '30'],
    hostConfig: {
        CapDrop: ['ALL'],
        CapAdd: ['SYS_ADMIN'],
        // apparmor:unconfined matters only on AppArmor hosts, whose default Docker profile denies mount.
        SecurityOpt: ['apparmor:unconfined', 'no-new-privileges:true'],
        Devices: [{PathOnHost: '/dev/fuse', PathInContainer: '/dev/fuse', CgroupPermissions: 'rwm'}],
    },
    networkAlias: false,
    essential: false,
    tmpfs: false,
})

// createWorkerType — throws if workerTypeId is unknown. data is {uid, gid} from DataFolder.prepare, or null.
const createWorkerType = (workerTypeId, instance, config, apiKey = null, data = null) => {
    if (workerTypeId === SANDBOX) {
        return createSandboxWorkerType(instance, config, apiKey, data)
    }
    throw new Error(`No worker type with id: ${workerTypeId}`)
}

export {
    createWorkerType,
    DATA_CACHE_VOLUME_PREFIX,
    dataCacheVolumeName,
    dataMountDir,
    dataUnavailableDir,
    SANDBOX,
    sidecarContainerName,
    TMP_VOLUME_PREFIX,
    tmpVolumeName,
    USER_HOME_NAME,
    withDataUnavailable,
    WORKER_IMAGE_NAMES,
}
