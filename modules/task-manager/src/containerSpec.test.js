import assert from 'node:assert/strict'
import {test} from 'node:test'

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
    taskCpus: 1
}
const TASK = createTask({id: 't-1', state: State.ACTIVE, username: 'alice', operation: 'image.GEE'})

test('runs the image of the release that launched it, under a name and labels that identify the task', () => {
    const spec = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    assert.equal(spec.name, 'task.alice.t-1')
    assert.equal(spec.Image, 'registry.test/openforis/task:1953')
    assert.deepEqual(
        spec.Labels,
        {[LABELS.MANAGED]: 'true', [LABELS.TASK_ID]: 't-1', [LABELS.USERNAME]: 'alice'}
    )
})

test('every operation gets the same memory limit', () => {
    const task = createTask({id: 't-1', state: State.ACTIVE, username: 'alice', operation: 'timeseries.download'})

    const {HostConfig} = containerSpec({task, apiKey: 'task_key', config: {...CONFIG, taskMemoryMb: 4096}})

    assert.equal(HostConfig.Memory, 4096 * 1024 * 1024)
})

test('mounts only its user\'s home and its own task directory', () => {
    const {HostConfig: {Binds}} = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    assert.deepEqual(
        Binds,
        ['/data/sepal/home/alice:/home/sepal-user', '/data/task-manager/tasks/t-1:/task']
    )
})

test('reaches SEPAL only through the gateway, on a network of its own, with the task\'s key', () => {
    const {Env, HostConfig} = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    assert.ok(new Set([
        'TASK_ID=t-1', 'TASK_API_KEY=task_key', 'SEPAL_ENDPOINT=http://gateway', 'USERNAME=sepal-user', 'PYTHONNOUSERSITE=1'
    ]).isSubsetOf(new Set(Env)))
    assert.equal(HostConfig.NetworkMode, 'sepal-task')
})

test('runs an init process so a container stop reaches the runner', () => {
    const {HostConfig} = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    assert.equal(HostConfig.Init, true)
})

test('is never restarted by Docker and is limited in memory and CPU', () => {
    const {HostConfig} = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    assert.deepEqual(HostConfig.RestartPolicy, {Name: 'no'})
    assert.equal(HostConfig.Memory, 2048 * 1024 * 1024)
    assert.equal(HostConfig.NanoCpus, 1e9)
})

test('yields CPU and memory to SEPAL\'s services when the host is under pressure', () => {
    const {HostConfig} = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    assert.equal(HostConfig.CpuShares, 256)
    assert.equal(HostConfig.OomScoreAdj, 500)
})

test('cannot swap beyond its memory limit or exhaust the host\'s processes', () => {
    const {HostConfig} = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    assert.equal(HostConfig.MemorySwap, HostConfig.Memory)
    assert.equal(HostConfig.PidsLimit, 1024)
})

test('sizes GDAL\'s cache and threads to the container', () => {
    const task = createTask({id: 't-1', state: State.ACTIVE, username: 'alice', operation: 'timeseries.download'})

    const {Env} = containerSpec({task, apiKey: 'task_key', config: {...CONFIG, taskMemoryMb: 4096, taskCpus: 2}})

    assert.ok(
        new Set(['GDAL_CACHEMAX=1024', 'GDAL_NUM_THREADS=2']).isSubsetOf(new Set(Env))
    )
})

test('logs to syslog under its user and task', () => {
    const {HostConfig} = containerSpec({task: TASK, apiKey: 'task_key', config: CONFIG})

    assert.deepEqual(
        HostConfig.LogConfig,
        {Type: 'syslog', Config: {'syslog-address': 'udp://172.20.128.2', tag: 'task/alice/t-1'}}
    )
})

test('in development, runs the checked-out source', () => {
    const {HostConfig: {Binds}} = containerSpec({task: TASK, apiKey: 'task_key', config: {...CONFIG, deployEnvironment: 'DEV'}})

    assert.ok(
        Binds.includes('/src/sepal/modules/task/src:/usr/local/src/sepal/modules/task/src')
    )
    assert.ok(
        Binds.includes('/src/sepal/lib/js/shared/src:/usr/local/src/sepal/lib/js/shared/src')
    )
})
