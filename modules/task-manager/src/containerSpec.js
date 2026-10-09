import {isLocalWork} from './operations.js'

export const LABELS = Object.freeze({
    MANAGED: 'org.openforis.sepal.task-manager',
    TASK_ID: 'org.openforis.sepal.task-id',
    USERNAME: 'org.openforis.sepal.username'
})

const CONTAINER_HOME = '/home/sepal-user'
const SOURCE = '/usr/local/src/sepal'

export const TASK_NETWORK = 'sepal-task'

// Tasks share the main host with SEPAL's services: under contention they get a quarter of a service's CPU weight,
// and the kernel kills a task before a service when memory runs out.
const CPU_SHARES = 256
const OOM_SCORE_ADJ = 500
const PIDS_LIMIT = 1024

// Named like a sandbox container ("{image}.{username}.{instanceName}.{instanceId}"), so `docker ps` on the host reads
// the same way for both.
export const containerName = ({id, username}) => `task.${username}.${id}`

export const taskDirectory = (sepalHostDataDir, taskId) =>
    `${sepalHostDataDir}/task-manager/tasks/${taskId}`

// The container mounts files its user can write, so it is kept off the sepal network, whose services trust the
// sepal-user header. Its own network holds only the gateway, which authenticates the task's key.
export const containerSpec = ({task, apiKey, config}) => {
    const dev = config.deployEnvironment === 'DEV'
    const memoryMb = isLocalWork(task.operation) ? config.taskLocalMemoryMb : config.taskMemoryMb
    return {
        name: containerName(task),
        Image: `${config.dockerRegistryHost}/openforis/task:${config.sepalVersion}`,
        Labels: {
            [LABELS.MANAGED]: 'true',
            [LABELS.TASK_ID]: task.id,
            [LABELS.USERNAME]: task.username
        },
        Env: [
            `TASK_ID=${task.id}`,
            `TASK_API_KEY=${apiKey}`,
            'SEPAL_ENDPOINT=http://gateway',
            'USERNAME=sepal-user',
            'PYTHONNOUSERSITE=1',
            `DEPLOY_ENVIRONMENT=${config.deployEnvironment}`,
            // GDAL sizes its block cache and threads from the host, not the container's limits.
            `GDAL_CACHEMAX=${Math.floor(memoryMb / 4)}`,
            `GDAL_NUM_THREADS=${Math.max(1, Math.round(config.taskCpus))}`
        ],
        HostConfig: {
            Binds: [
                `${config.sepalHostDataDir}/sepal/home/${task.username}:${CONTAINER_HOME}`,
                `${taskDirectory(config.sepalHostDataDir, task.id)}:/task`,
                ...(dev ? sourceBinds(config.sepalHostProjectDir) : [])
            ],
            Init: true,
            RestartPolicy: {Name: 'no'},
            Memory: memoryMb * 1024 * 1024,
            MemorySwap: memoryMb * 1024 * 1024,
            NanoCpus: Math.round(config.taskCpus * 1e9),
            CpuShares: CPU_SHARES,
            OomScoreAdj: OOM_SCORE_ADJ,
            PidsLimit: PIDS_LIMIT,
            NetworkMode: TASK_NETWORK,
            ...(config.syslogAddress
                ? {LogConfig: {Type: 'syslog', Config: {'syslog-address': config.syslogAddress, tag: `task/${task.username}/${task.id}`}}}
                : {})
        }
    }
}

const sourceBinds = projectDir => [
    `${projectDir}/modules/task/src:${SOURCE}/modules/task/src`,
    `${projectDir}/lib/js/shared/src:${SOURCE}/lib/js/shared/src`
]
