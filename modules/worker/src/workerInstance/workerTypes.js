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

const makeImage = ({name, exposedPorts = [], publishedPorts = {}, volumes = {}, links = {}, environment = {}, runCommand = [], waitCommand = []}) => ({
    name,
    exposedPorts,
    publishedPorts,
    volumes,
    links,
    environment,
    runCommand,
    waitCommand,
    containerName: instance => containerName({
        image: name,
        username: instance.reservation.username,
        sessionId: instance.reservation.sessionId,
        instanceId: instance.id,
    }),
})

// publishedPorts is {hostPort: containerPort}; the waitCommand covers sshd only.
const createSandboxWorkerType = (instance, config, apiKey) => {
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

    return {
        id: SANDBOX,
        images: [
            makeImage({
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
            }),
        ],
    }
}

// createWorkerType — throws if workerTypeId is unknown.
const createWorkerType = (workerTypeId, instance, config, apiKey = null) => {
    if (workerTypeId === SANDBOX) {
        return createSandboxWorkerType(instance, config, apiKey)
    }
    throw new Error(`No worker type with id: ${workerTypeId}`)
}

export {createWorkerType, SANDBOX, TMP_VOLUME_PREFIX, tmpVolumeName, USER_HOME_NAME, WORKER_IMAGE_NAMES}
