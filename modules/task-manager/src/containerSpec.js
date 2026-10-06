export const LABELS = Object.freeze({
    MANAGED: 'org.openforis.sepal.task-manager',
    TASK_ID: 'org.openforis.sepal.task-id',
    USERNAME: 'org.openforis.sepal.username'
})

const CONTAINER_HOME = '/home/sepal-user'
const SOURCE = '/usr/local/src/sepal'

export const TASK_NETWORK = 'sepal-task'

export const containerName = taskId => `sepal-task-${taskId}`

export const taskDirectory = (sepalHostDataDir, taskId) =>
    `${sepalHostDataDir}/task-manager/tasks/${taskId}`

// The container mounts files its user can write, so it is kept off the sepal network, whose services trust the
// sepal-user header. Its own network holds only the gateway, which authenticates the task's key.
export const containerSpec = ({task, apiKey, config}) => {
    const dev = config.deployEnvironment === 'DEV'
    return {
        name: containerName(task.id),
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
            `DEPLOY_ENVIRONMENT=${config.deployEnvironment}`
        ],
        HostConfig: {
            Binds: [
                `${config.sepalHostDataDir}/sepal/home/${task.username}:${CONTAINER_HOME}`,
                `${taskDirectory(config.sepalHostDataDir, task.id)}:/task`,
                ...(dev ? sourceBinds(config.sepalHostProjectDir) : [])
            ],
            RestartPolicy: {Name: 'no'},
            Memory: config.taskMemoryMb * 1024 * 1024,
            NanoCpus: Math.round(config.taskCpus * 1e9),
            NetworkMode: TASK_NETWORK,
            ...(config.syslogAddress
                ? {LogConfig: {Type: 'syslog', Config: {'syslog-address': config.syslogAddress, tag: 'task/{{.Name}}'}}}
                : {})
        }
    }
}

const sourceBinds = projectDir => [
    `${projectDir}/modules/task/src:${SOURCE}/modules/task/src`,
    `${projectDir}/lib/js/shared/src:${SOURCE}/lib/js/shared/src`
]
