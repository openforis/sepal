import {containerName} from './containerSpec.js'
import {ContainerSupervisor} from './containerSupervisor.js'
import {createTask, State} from './task.js'
import {InMemoryRepository} from './testSupport/inMemoryRepository.js'

describe('launching', () => {
    test('a pending task gets a running container and becomes active', async () => {
        const {supervisor, repository, docker} = setup()
        const task = await repository.add(aTask())

        await supervisor.dispatch()

        expect(docker.containers.get('task.alice.t-1')).toMatchObject({running: true, taskId: 't-1'})
        expect(await repository.getTask(task.id)).toMatchObject({state: State.ACTIVE})
    })

    test('no more containers run than allowed; the oldest pending task goes first', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrent: 1})
        await repository.add(aTask({id: 't-2', creationTime: new Date(2000)}))
        await repository.add(aTask({id: 't-1', creationTime: new Date(1000)}))

        await supervisor.dispatch()

        expect([...docker.containers.keys()]).toEqual(['task.alice.t-1'])
        expect((await repository.getTask('t-2')).state).toBe(State.PENDING)
    })

    test('a task whose container cannot be started fails', async () => {
        const {supervisor, repository, docker} = setup()
        docker.failRun = true
        await repository.add(aTask())

        await supervisor.dispatch()

        const task = await repository.getTask('t-1')
        expect(task.state).toBe(State.FAILED)
        expect(JSON.parse(task.statusDescription)).toMatchObject({messageKey: 'tasks.status.launchFailed'})
    })

    test('a task whose container cannot be started does not take a slot from the next pending task', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrent: 1})
        docker.failingRuns.add('task.alice.t-1')
        await repository.add(aTask({id: 't-1', creationTime: new Date(1000)}))
        await repository.add(aTask({id: 't-2', creationTime: new Date(2000)}))

        await supervisor.dispatch()

        expect((await repository.getTask('t-1')).state).toBe(State.FAILED)
        expect(docker.containers.get('task.alice.t-2')).toMatchObject({running: true})
    })
})

describe('collecting', () => {
    test('a container that exits leaves its task in the state its result names, and is removed', async () => {
        const {supervisor, repository, docker, workspace} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()

        workspace.results.set('t-1', {state: 'COMPLETED', statusDescription: {messageKey: 'tasks.status.completed', defaultMessage: 'Completed!'}})
        docker.exit('task.alice.t-1', 0)
        await supervisor.idle()

        expect(await repository.getTask('t-1')).toMatchObject({
            state: State.COMPLETED,
            statusDescription: JSON.stringify({messageKey: 'tasks.status.completed', defaultMessage: 'Completed!'})
        })
        expect(docker.containers.has('task.alice.t-1')).toBe(false)
        expect(workspace.removed).toEqual(['t-1'])
    })

    test('a container that exits without a result fails its task', async () => {
        const {supervisor, repository, docker} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()

        docker.exit('task.alice.t-1', 137)
        await supervisor.idle()

        const task = await repository.getTask('t-1')
        expect(task.state).toBe(State.FAILED)
        expect(JSON.parse(task.statusDescription)).toMatchObject({messageKey: 'tasks.status.exitedUnexpectedly'})
    })

    test('a container being cancelled that exits without a result is canceled', async () => {
        const {supervisor, repository, docker} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()
        await repository.transition(await repository.getTask('t-1'), {from: [State.ACTIVE], to: State.CANCELING})

        docker.exit('task.alice.t-1', 143)
        await supervisor.idle()

        expect((await repository.getTask('t-1')).state).toBe(State.CANCELED)
    })

    test('a container stopped while its task was not being cancelled was interrupted, whatever its result says', async () => {
        const {supervisor, repository, docker, workspace} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()

        workspace.results.set('t-1', {state: 'CANCELED'})
        docker.exit('task.alice.t-1', 0)
        await supervisor.idle()

        const task = await repository.getTask('t-1')
        expect(task.state).toBe(State.FAILED)
        expect(JSON.parse(task.statusDescription)).toMatchObject({messageKey: 'tasks.status.interrupted'})
    })

    test('a container being cancelled that reports itself canceled is canceled', async () => {
        const {supervisor, repository, docker, workspace} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()
        await repository.transition(await repository.getTask('t-1'), {from: [State.ACTIVE], to: State.CANCELING})

        workspace.results.set('t-1', {state: 'CANCELED'})
        docker.exit('task.alice.t-1', 0)
        await supervisor.idle()

        expect((await repository.getTask('t-1')).state).toBe(State.CANCELED)
    })

    test('a finished container frees its slot for the next pending task', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrent: 1})
        await repository.add(aTask({id: 't-1', creationTime: new Date(1000)}))
        await repository.add(aTask({id: 't-2', creationTime: new Date(2000)}))
        await supervisor.dispatch()

        docker.exit('task.alice.t-1', 1)
        await supervisor.idle()

        expect(docker.containers.get('task.alice.t-2')).toMatchObject({running: true})
    })
})

describe('reconciling after a restart', () => {
    test('a running container found after a restart is watched', async () => {
        const {repository, docker, workspace, newSupervisor} = setup()
        await repository.add(aTask({state: State.ACTIVE}))
        docker.containers.set('task.alice.t-1', {taskId: 't-1', running: true})
        const supervisor = newSupervisor()

        await supervisor.reconcile()
        workspace.results.set('t-1', {state: 'COMPLETED', statusDescription: {messageKey: 'tasks.status.completed'}})
        docker.exit('task.alice.t-1', 0)
        await supervisor.idle()

        expect((await repository.getTask('t-1')).state).toBe(State.COMPLETED)
    })

    test('an exited container found after a restart is collected', async () => {
        const {repository, docker, workspace, newSupervisor} = setup()
        await repository.add(aTask({state: State.ACTIVE}))
        docker.containers.set('task.alice.t-1', {taskId: 't-1', running: false, exitCode: 0})
        workspace.results.set('t-1', {state: 'FAILED', statusDescription: {messageKey: 'tasks.status.failed'}})

        await newSupervisor().reconcile()

        expect((await repository.getTask('t-1')).state).toBe(State.FAILED)
        expect(docker.containers.has('task.alice.t-1')).toBe(false)
    })

    test('an active task without a container was interrupted by a server restart', async () => {
        const {repository, newSupervisor} = setup()
        await repository.add(aTask({state: State.ACTIVE}))

        await newSupervisor().reconcile()

        const task = await repository.getTask('t-1')
        expect(task.state).toBe(State.FAILED)
        expect(JSON.parse(task.statusDescription)).toMatchObject({messageKey: 'tasks.status.interrupted'})
    })

    test('a canceling task without a container is canceled', async () => {
        const {repository, newSupervisor} = setup()
        await repository.add(aTask({state: State.CANCELING}))

        await newSupervisor().reconcile()

        expect((await repository.getTask('t-1')).state).toBe(State.CANCELED)
    })

    test('a container whose wait was interrupted is watched again', async () => {
        const {supervisor, repository, docker, workspace} = setup()
        docker.failWaits = true
        await repository.add(aTask())
        await supervisor.dispatch()
        await supervisor.idle()
        docker.failWaits = false

        await supervisor.reconcile()
        workspace.results.set('t-1', {state: 'COMPLETED', statusDescription: {messageKey: 'tasks.status.completed'}})
        docker.exit('task.alice.t-1', 0)
        await supervisor.idle()

        expect((await repository.getTask('t-1')).state).toBe(State.COMPLETED)
    })

    test('a container no task is running in is removed', async () => {
        const {docker, newSupervisor} = setup()
        docker.containers.set('task.alice.gone', {taskId: 'gone', running: true})

        await newSupervisor().reconcile()

        expect(docker.containers.has('task.alice.gone')).toBe(false)
    })

    test('a container without a task id is removed, and does not stop the rest of the reconcile', async () => {
        const {docker, newSupervisor} = setup()
        docker.containers.set('unlabelled-1', {running: true})
        docker.containers.set('unlabelled-2', {running: false})
        docker.containers.set('task.alice.gone', {taskId: 'gone', running: true})

        await newSupervisor().reconcile()

        expect([...docker.containers.keys()]).toEqual([])
    })

    test('reconcile does not fail a task whose launch is in progress', async () => {
        const {supervisor, repository, docker} = setup()
        await repository.add(aTask())
        docker.holdRuns()

        const launch = supervisor.dispatch()
        await docker.runHeld()
        const reconcile = supervisor.reconcile()
        docker.releaseRun()
        await Promise.all([launch, reconcile])

        expect((await repository.getTask('t-1')).state).toBe(State.ACTIVE)
    })
})

describe('timeouts', () => {
    test('a container silent for too long is killed and its task fails', async () => {
        const {supervisor, repository, docker, clock} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()

        clock.advance(16 * 60 * 1000)
        await supervisor.enforceTimeouts()
        await supervisor.idle()

        const task = await repository.getTask('t-1')
        expect(task.state).toBe(State.FAILED)
        expect(JSON.parse(task.statusDescription)).toMatchObject({messageKey: 'tasks.status.stalled'})
        expect(docker.killed).toEqual(['task.alice.t-1'])
    })

    test('a cancellation the container does not finish in time is forced', async () => {
        const {supervisor, repository, docker, clock} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()
        await repository.transition(await repository.getTask('t-1'), {from: [State.ACTIVE], to: State.CANCELING})

        clock.advance(6 * 60 * 1000)
        await supervisor.enforceTimeouts()
        await supervisor.idle()

        expect((await repository.getTask('t-1')).state).toBe(State.CANCELED)
        expect(docker.killed).toEqual(['task.alice.t-1'])
    })
})

describe('starting', () => {
    test('task-manager downtime does not count against a cancellation in progress', async () => {
        const {repository, docker, clock, newSupervisor} = setup()
        await repository.add(aTask({state: State.CANCELING}))
        docker.containers.set('task.alice.t-1', {taskId: 't-1', running: true})
        clock.advance(6 * 60 * 1000)
        const supervisor = newSupervisor()

        await supervisor.start()
        await supervisor.enforceTimeouts()
        supervisor.stop()

        expect((await repository.getTask('t-1')).state).toBe(State.CANCELING)
        expect(docker.killed).toEqual([])
    })
})

describe('local work', () => {
    test('a pending export to SEPAL waits for a local slot while a later asset export starts', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrentLocal: 1})
        await repository.insert(aTask({id: 't-1', operation: 'image.SEPAL', creationTime: new Date(1000)}))
        await repository.insert(aTask({id: 't-2', operation: 'timeseries.download', creationTime: new Date(2000)}))
        await repository.insert(aTask({id: 't-3', operation: 'image.GEE', creationTime: new Date(3000)}))

        await supervisor.dispatch()

        expect([...docker.containers.keys()].sort()).toEqual(['task.alice.t-1', 'task.alice.t-3'])
        expect((await repository.getTask('t-2')).state).toBe(State.PENDING)
    })

    test('a finished local task lets the next local one start', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrentLocal: 1})
        await repository.insert(aTask({id: 't-1', operation: 'image.SEPAL', creationTime: new Date(1000)}))
        await repository.insert(aTask({id: 't-2', operation: 'image.SEPAL', creationTime: new Date(2000)}))
        await supervisor.dispatch()

        docker.exit('task.alice.t-1', 1)
        await supervisor.idle()

        expect(docker.containers.get('task.alice.t-2')).toMatchObject({running: true})
    })

    test('a local task whose container cannot be started does not take the local slot', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrentLocal: 1})
        docker.failingRuns.add('task.alice.t-1')
        await repository.insert(aTask({id: 't-1', operation: 'image.SEPAL', creationTime: new Date(1000)}))
        await repository.insert(aTask({id: 't-2', operation: 'image.SEPAL', creationTime: new Date(2000)}))

        await supervisor.dispatch()

        expect((await repository.getTask('t-1')).state).toBe(State.FAILED)
        expect(docker.containers.get('task.alice.t-2')).toMatchObject({running: true})
    })
})

describe('stopping', () => {
    test('stopping a container asks Docker to stop it with a grace period, without waiting for it to exit', async () => {
        const {supervisor, repository, docker} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()

        await supervisor.stopContainer(await repository.getTask('t-1'))

        expect(docker.stopped).toEqual([{name: 'task.alice.t-1', seconds: 120}])
    })

    test('a container whose launch is in progress is stopped once it runs', async () => {
        const {supervisor, repository, docker} = setup()
        await repository.add(aTask())
        docker.holdRuns()
        const launch = supervisor.dispatch()
        await docker.runHeld()

        const stopping = supervisor.stopContainer(await repository.getTask('t-1'))
        docker.releaseRun()
        await Promise.all([launch, stopping])

        expect(docker.stopped).toEqual([{name: 'task.alice.t-1', seconds: 120}])
    })
})

// --- harness ---

const aTask = overrides => createTask({
    id: 't-1', state: State.PENDING, username: 'alice', operation: 'image.GEE', params: {},
    creationTime: new Date(1000), updateTime: new Date(1000), ...overrides
})

const setup = ({maxConcurrent = 10, maxConcurrentLocal = 10} = {}) => {
    const clock = fakeClock()
    const repository = new InMemoryRepository(clock)
    const docker = new FakeDocker()
    const workspace = new FakeWorkspace()
    const newSupervisor = () => new ContainerSupervisor({
        repository,
        docker,
        workspace,
        spec: ({task, apiKey}) => ({name: containerName(task), taskId: task.id, apiKey}),
        config: {maxConcurrent, maxConcurrentLocal, stallTimeoutMs: 15 * 60 * 1000, cancelTimeoutMs: 5 * 60 * 1000, stopGraceSeconds: 120, clock: clock.now}
    })
    return {supervisor: newSupervisor(), newSupervisor, repository, docker, workspace, clock}
}

const fakeClock = () => {
    let time = 1_000_000
    return {now: () => new Date(time), advance: ms => time += ms}
}

class FakeDocker {
    containers = new Map()
    killed = []
    stopped = []
    failRun = false
    failingRuns = new Set()
    failWaits = false
    #waiters = new Map()
    #gate = null
    #open = null
    #held = null
    #onHeld = null

    holdRuns() {
        this.#gate = new Promise(resolve => this.#open = resolve)
        this.#held = new Promise(resolve => this.#onHeld = resolve)
    }

    runHeld() {
        return this.#held
    }

    releaseRun() {
        this.#open()
    }

    async run(spec) {
        if (this.#gate) {
            this.#onHeld()
            await this.#gate
        }
        if (this.failRun || this.failingRuns.has(spec.name)) {
            throw new Error('no such image')
        }
        this.containers.set(spec.name, {taskId: spec.taskId, running: true})
    }

    async list() {
        return [...this.containers.entries()].map(([name, {taskId, running}]) => ({name, taskId, running}))
    }

    wait(name) {
        if (this.failWaits) {
            return Promise.reject(new Error('socket hang up'))
        }
        const container = this.containers.get(name)
        if (container && !container.running) {
            return Promise.resolve({StatusCode: container.exitCode})
        }
        return this.#untilExit(name)
    }

    exit(name, exitCode) {
        this.containers.set(name, {...this.containers.get(name), running: false, exitCode})
        this.#waiters.get(name)?.forEach(resolve => resolve({StatusCode: exitCode}))
        this.#waiters.delete(name)
    }

    // Like Docker, a stop settles only once the container has exited.
    async stop(name, seconds) {
        if (this.containers.has(name)) {
            this.stopped.push({name, seconds})
            await this.#untilExit(name)
        }
    }

    async kill(name) {
        this.killed.push(name)
        this.exit(name, 137)
    }

    async remove(name) {
        this.containers.delete(name)
    }

    #untilExit(name) {
        return new Promise(resolve => this.#waiters.set(name, [...this.#waiters.get(name) ?? [], resolve]))
    }
}

class FakeWorkspace {
    results = new Map()
    prepared = []
    removed = []

    async prepare(task) {
        this.prepared.push(task.id)
    }

    async readResult(taskId) {
        return this.results.get(taskId) ?? null
    }

    // Like the real workspace, whose path join rejects a missing id.
    async remove(taskId) {
        if (typeof taskId !== 'string') {
            throw new TypeError(`The "path" argument must be of type string. Received ${taskId}`)
        }
        this.removed.push(taskId)
    }
}
