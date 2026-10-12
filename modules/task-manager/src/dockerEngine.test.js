import {LABELS} from './containerSpec.js'
import {DockerEngine} from './dockerEngine.js'

const TIMEOUT_MS = 10

describe('calls the supervisor waits on give up when Docker does not answer', () => {
    test('running a container', async () => {
        const engine = new DockerEngine(unresponsiveDocker(), {timeoutMs: TIMEOUT_MS})

        await expect(engine.run({name: 'task.alice.t-1'})).rejects.toThrow(/task.alice.t-1.*timed out/)
    })

    test('listing containers', async () => {
        const engine = new DockerEngine(unresponsiveDocker(), {timeoutMs: TIMEOUT_MS})

        await expect(engine.list()).rejects.toThrow(/timed out/)
    })

    test('killing a container', async () => {
        const engine = new DockerEngine(unresponsiveDocker(), {timeoutMs: TIMEOUT_MS})

        await expect(engine.kill('task.alice.t-1')).rejects.toThrow(/task.alice.t-1.*timed out/)
    })

    test('removing a container', async () => {
        const engine = new DockerEngine(unresponsiveDocker(), {timeoutMs: TIMEOUT_MS})

        await expect(engine.remove('task.alice.t-1')).rejects.toThrow(/task.alice.t-1.*timed out/)
    })
})

test('waiting for a container lasts as long as the container runs', async () => {
    const engine = new DockerEngine(dockerWithContainer({wait: () => after(5 * TIMEOUT_MS, {StatusCode: 0})}), {timeoutMs: TIMEOUT_MS})

    await expect(engine.wait('task.alice.t-1')).resolves.toEqual({StatusCode: 0})
})

test('a call Docker answers in time settles with its answer', async () => {
    const docker = {listContainers: async () => [{Names: ['/task.alice.t-1'], Labels: {[LABELS.TASK_ID]: 't-1'}, State: 'running'}]}
    const engine = new DockerEngine(docker, {timeoutMs: 1000})

    expect(await engine.list()).toEqual([{name: 'task.alice.t-1', taskId: 't-1', running: true}])
})

const never = () => new Promise(() => {})

const after = (ms, value) => new Promise(resolve => setTimeout(() => resolve(value), ms))

const unresponsiveDocker = () => ({
    createContainer: never,
    listContainers: never,
    getContainer: () => ({start: never, kill: never, remove: never, wait: never, stop: never})
})

const dockerWithContainer = container => ({getContainer: () => container})
