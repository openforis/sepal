// WorkerTypes — container specs for the SANDBOX and TASK_EXECUTOR worker types.
//
// tempDir() has an fs side effect: mkdir /data/home/{username}/tmp/{instanceId} + chmod 1777.
// containerName(instance) comes from ../containerName.js: the last segment is the two-word name
// the user reads for the instance, so the reservation must carry the session id it derives from.

import fs from 'node:fs'

import {getLogger} from '#sepal/log'

import {containerName} from '../containerName.js'

const log = getLogger('workerTypes')

const SANDBOX = 'sandbox'
const TASK_EXECUTOR = 'task-executor'
const USER_HOME_NAME = 'sepal-user'

// tempDir — filesystem side effect at provision time: mkdir + chmod 1777 of
// /data/home/{username}/tmp/{instanceId}. localTmp is ALWAYS under /data/home; the returned
// mount path uses sepalHostDataDir (the host path visible to Docker).
const tempDir = (instance, config) => {
    const username = instance.reservation.username
    const localTmp = `/data/home/${username}/tmp/${instance.id}`
    log.debug(`Creating tempDir: ${localTmp}`)
    fs.mkdirSync(localTmp, {recursive: true})
    fs.chmodSync(localTmp, 0o1777)
    return `${config.sepalHostDataDir}/sepal/home/${username}/tmp/${instance.id}`
}

// WORKER_IMAGE_NAMES — every image name a worker instance can run; the provisioner uses
// these to recognize SEPAL worker containers among everything else on a (shared) daemon.
const WORKER_IMAGE_NAMES = ['sandbox', 'task']

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
    }),
})

// publishedPorts is {hostPort: containerPort}; the waitCommand covers sshd only.
const createSandboxWorkerType = (instance, config, apiKey) => {
    const username = instance.reservation.username
    const userHome = `${config.sepalHostDataDir}/sepal/home/${username}`
    const userTmp = tempDir(instance, config)

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
                    [userTmp]: ['/tmp', `/home/${USER_HOME_NAME}/tmp`],
                },
                environment: {
                    USER_PUBLIC_KEY: userPublicKey,
                    SEPAL_API_KEY: apiKey ?? '',
                    SEPAL_HOST: config.sepalHost,
                    NVIDIA_VISIBLE_DEVICES: 'all',
                    NVIDIA_DRIVER_CAPABILITIES: 'all',
                },
                runCommand: ['/script/init_container.sh'],
                waitCommand: ['/script/wait_until_initialized.sh', waitPorts],
            }),
        ],
    }
}

const createTaskExecutorWorkerType = (instance, config) => {
    const username = instance.reservation.username
    const userHome = `${config.sepalHostDataDir}/sepal/home/${username}`
    const userTmp = tempDir(instance, config)

    const eePrivateKey = (config.googleEarthEnginePrivateKey ?? '').replaceAll('\n', '-----LINE BREAK-----')

    const sepalEndpoint = `https://${config.sepalHost}:${config.sepalHttpsPort ?? 443}`

    const volumes = {
        [userHome]: `/home/${USER_HOME_NAME}`,
        [userTmp]: ['/tmp', `/home/${USER_HOME_NAME}/tmp`],
    }

    // DEV mode: hot-reload mounts for task + shared lib.
    // Without sepalHostProjectDir the binds would degrade to '/modules/task/src' etc. — Docker
    // creates empty host dirs and mounts them OVER the image's baked-in code, breaking the container.
    if (config.deployEnvironment === 'DEV') {
        if (config.sepalHostProjectDir) {
            volumes[`${config.sepalHostProjectDir}/modules/task/src`] = '/usr/local/src/sepal/modules/task/src'
            volumes[`${config.sepalHostProjectDir}/lib/js/shared/src`] = '/usr/local/src/sepal/lib/js/shared/src'
            volumes[`${config.sepalHostProjectDir}/lib/js/ee/src`] = '/usr/local/src/sepal/lib/js/ee/src'
        } else {
            log.warn('DEV deploy environment but sepalHostProjectDir is not set - skipping task hot-reload mounts')
        }
    }

    return {
        id: TASK_EXECUTOR,
        images: [
            makeImage({
                name: 'task',
                exposedPorts: [80],
                publishedPorts: {8080: 80},
                volumes,
                environment: {
                    GOOGLE_PROJECT_ID: config.googleProjectId,
                    GOOGLE_REGION: config.googleRegion,
                    EE_ACCOUNT: config.googleEarthEngineAccount,
                    EE_PRIVATE_KEY: eePrivateKey,
                    SEPAL_ENDPOINT: sepalEndpoint,
                    SEPAL_ADMIN_PASSWORD: config.sepalPassword,
                    USERNAME: USER_HOME_NAME,
                    NODE_TLS_REJECT_UNAUTHORIZED: config.deployEnvironment === 'DEV' ? 0 : 1,
                    DEPLOY_ENVIRONMENT: config.deployEnvironment,
                    NVIDIA_VISIBLE_DEVICES: 'all',
                    NVIDIA_DRIVER_CAPABILITIES: 'all',
                },
                waitCommand: ['wait_until_initialized.sh'],
            }),
        ],
    }
}

// createWorkerType — throws if workerTypeId is unknown.
const createWorkerType = (workerTypeId, instance, config, apiKey = null) => {
    if (workerTypeId === SANDBOX) {
        return createSandboxWorkerType(instance, config, apiKey)
    }
    if (workerTypeId === TASK_EXECUTOR) {
        return createTaskExecutorWorkerType(instance, config)
    }
    throw new Error(`No worker type with id: ${workerTypeId}`)
}

export {createWorkerType, SANDBOX, TASK_EXECUTOR, tempDir, USER_HOME_NAME, WORKER_IMAGE_NAMES}
