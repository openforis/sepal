import {containerSpec, LABELS} from './containerSpec.js'
import {createTask, State} from './task.js'

const CONFIG = {
    sepalVersion: '1953',
    dockerRegistryHost: 'registry.test',
    sepalHostDataDir: '/data',
    sepalHostProjectDir: '/src/sepal',
    deployEnvironment: 'PROD',
    syslogAddress: 'udp://172.20.128.2',
    taskMemoryMb: 2048,
    taskLocalMemoryMb: 4096,
    taskCpus: 1
}
const TASK = createTask({id: 't-1', state: State.ACTIVE, username: 'alice', operation: 'image.GEE'})

test('runs the image of the release that launched it, under a name and labels that identify the task', () => {
    const spec = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    expect(spec.name).toBe('sepal-task-t-1')
    expect(spec.Image).toBe('registry.test/openforis/task:1953')
    expect(spec.Labels).toEqual({[LABELS.MANAGED]: 'true', [LABELS.TASK_ID]: 't-1', [LABELS.USERNAME]: 'alice'})
})

test('local work gets the larger memory limit', () => {
    const task = createTask({id: 't-1', state: State.ACTIVE, username: 'alice', operation: 'timeseries.download'})

    const {HostConfig} = containerSpec({task, apiKey: 'task_key', config: {...CONFIG, taskLocalMemoryMb: 4096}})

    expect(HostConfig.Memory).toBe(4096 * 1024 * 1024)
})

test('mounts only its user\'s home and its own task directory', () => {
    const {HostConfig: {Binds}} = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    expect(Binds).toEqual(['/data/sepal/home/alice:/home/sepal-user', '/data/task-manager/tasks/t-1:/task'])
})

test('reaches SEPAL only through the gateway, on a network of its own, with the task\'s key', () => {
    const {Env, HostConfig} = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    expect(Env).toEqual(expect.arrayContaining([
        'TASK_ID=t-1', 'TASK_API_KEY=task_key', 'SEPAL_ENDPOINT=http://gateway', 'USERNAME=sepal-user', 'PYTHONNOUSERSITE=1'
    ]))
    expect(HostConfig.NetworkMode).toBe('sepal-task')
})

test('runs an init process so a container stop reaches the runner', () => {
    const {HostConfig} = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    expect(HostConfig.Init).toBe(true)
})

test('is never restarted by Docker and is limited in memory and CPU', () => {
    const {HostConfig} = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    expect(HostConfig.RestartPolicy).toEqual({Name: 'no'})
    expect(HostConfig.Memory).toBe(2048 * 1024 * 1024)
    expect(HostConfig.NanoCpus).toBe(1e9)
})

test('in development, runs the checked-out source', () => {
    const {HostConfig: {Binds}} = containerSpec({task: TASK, apiKey: 'task_key', config: {...CONFIG, deployEnvironment: 'DEV'}})

    expect(Binds).toContain('/src/sepal/modules/task/src:/usr/local/src/sepal/modules/task/src')
    expect(Binds).toContain('/src/sepal/lib/js/shared/src:/usr/local/src/sepal/lib/js/shared/src')
})
