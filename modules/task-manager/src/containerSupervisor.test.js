import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {containerName} from './containerSpec.js'
import {ContainerSupervisor} from './containerSupervisor.js'
import {createTask, State} from './task.js'
import {InMemoryRepository} from './testSupport/inMemoryRepository.js'

describe('launching', () => {
    test('a pending task gets a running container and becomes active', async () => {
        const {supervisor, repository, docker} = setup()
        const task = await repository.add(aTask())

        await supervisor.dispatch()

        assert.partialDeepStrictEqual(docker.containers.get('task.alice.t-1'), {running: true, taskId: 't-1'})
        assert.partialDeepStrictEqual(await repository.getTask(task.id), {state: State.ACTIVE})
    })

    test('no more containers run than allowed; the oldest pending task goes first', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrent: 1})
        await repository.add(aTask({id: 't-2', creationTime: new Date(2000)}))
        await repository.add(aTask({id: 't-1', creationTime: new Date(1000)}))

        await supervisor.dispatch()

        assert.deepEqual([...docker.containers.keys()], ['task.alice.t-1'])
        assert.equal((await repository.getTask('t-2')).state, State.PENDING)
    })

    test('exports to SEPAL start like any other export, up to the limit', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrent: 2})
        await repository.insert(aTask({id: 't-1', operation: 'image.SEPAL', creationTime: new Date(1000)}))
        await repository.insert(aTask({id: 't-2', operation: 'timeseries.download', creationTime: new Date(2000)}))
        await repository.insert(aTask({id: 't-3', operation: 'image.GEE', creationTime: new Date(3000)}))

        await supervisor.dispatch()

        assert.deepEqual([...docker.containers.keys()].sort(), ['task.alice.t-1', 'task.alice.t-2'])
    })

    test('a task whose container cannot be started fails', async () => {
        const {supervisor, repository, docker} = setup()
        docker.failRun = true
        await repository.add(aTask())

        await supervisor.dispatch()

        const task = await repository.getTask('t-1')
        assert.equal(task.state, State.FAILED)
        assert.partialDeepStrictEqual(
            JSON.parse(task.statusDescription),
            {messageKey: 'tasks.status.launchFailed'}
        )
    })

    test('a task whose container cannot be started has its workspace removed, even when Docker fails', async () => {
        const {supervisor, repository, docker, workspace} = setup()
        docker.failRun = true
        docker.failRemove = true
        await repository.add(aTask())

        await supervisor.dispatch()

        assert.deepEqual(workspace.removed, ['t-1'])
    })

    test('a task whose container cannot be started does not take a slot from the next pending task', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrent: 1})
        docker.failingRuns.add('task.alice.t-1')
        await repository.add(aTask({id: 't-1', creationTime: new Date(1000)}))
        await repository.add(aTask({id: 't-2', creationTime: new Date(2000)}))

        await supervisor.dispatch()

        assert.equal((await repository.getTask('t-1')).state, State.FAILED)
        assert.partialDeepStrictEqual(docker.containers.get('task.alice.t-2'), {running: true})
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

        assert.partialDeepStrictEqual(await repository.getTask('t-1'), {
            state: State.COMPLETED,
            statusDescription: JSON.stringify({messageKey: 'tasks.status.completed', defaultMessage: 'Completed!'})
        })
        assert.equal(docker.containers.has('task.alice.t-1'), false)
        assert.deepEqual(workspace.removed, ['t-1'])
    })

    test('a container that exits without a result fails its task', async () => {
        const {supervisor, repository, docker} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()

        docker.exit('task.alice.t-1', 137)
        await supervisor.idle()

        const task = await repository.getTask('t-1')
        assert.equal(task.state, State.FAILED)
        assert.partialDeepStrictEqual(
            JSON.parse(task.statusDescription),
            {messageKey: 'tasks.status.exitedUnexpectedly'}
        )
    })

    test('a container being cancelled that exits without a result is canceled', async () => {
        const {supervisor, repository, docker} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()
        await repository.transition(await repository.getTask('t-1'), {from: [State.ACTIVE], to: State.CANCELING})

        docker.exit('task.alice.t-1', 143)
        await supervisor.idle()

        assert.equal((await repository.getTask('t-1')).state, State.CANCELED)
    })

    test('a container stopped while its task was not being cancelled was interrupted, whatever its result says', async () => {
        const {supervisor, repository, docker, workspace} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()

        workspace.results.set('t-1', {state: 'CANCELED'})
        docker.exit('task.alice.t-1', 0)
        await supervisor.idle()

        const task = await repository.getTask('t-1')
        assert.equal(task.state, State.FAILED)
        assert.partialDeepStrictEqual(
            JSON.parse(task.statusDescription),
            {messageKey: 'tasks.status.interrupted'}
        )
    })

    test('a container being cancelled that reports itself canceled is canceled', async () => {
        const {supervisor, repository, docker, workspace} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()
        await repository.transition(await repository.getTask('t-1'), {from: [State.ACTIVE], to: State.CANCELING})

        workspace.results.set('t-1', {state: 'CANCELED'})
        docker.exit('task.alice.t-1', 0)
        await supervisor.idle()

        assert.equal((await repository.getTask('t-1')).state, State.CANCELED)
    })

    test('a finished container frees its slot for the next pending task', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrent: 1})
        await repository.add(aTask({id: 't-1', creationTime: new Date(1000)}))
        await repository.add(aTask({id: 't-2', creationTime: new Date(2000)}))
        await supervisor.dispatch()

        docker.exit('task.alice.t-1', 1)
        await supervisor.idle()

        assert.partialDeepStrictEqual(docker.containers.get('task.alice.t-2'), {running: true})
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

        assert.equal((await repository.getTask('t-1')).state, State.COMPLETED)
    })

    test('an exited container found after a restart is collected', async () => {
        const {repository, docker, workspace, newSupervisor} = setup()
        await repository.add(aTask({state: State.ACTIVE}))
        docker.containers.set('task.alice.t-1', {taskId: 't-1', running: false, exitCode: 0})
        workspace.results.set('t-1', {state: 'FAILED', statusDescription: {messageKey: 'tasks.status.failed'}})

        await newSupervisor().reconcile()

        assert.equal((await repository.getTask('t-1')).state, State.FAILED)
        assert.equal(docker.containers.has('task.alice.t-1'), false)
    })

    test('an active task without a container was interrupted by a server restart', async () => {
        const {repository, newSupervisor} = setup()
        await repository.add(aTask({state: State.ACTIVE}))

        await newSupervisor().reconcile()

        const task = await repository.getTask('t-1')
        assert.equal(task.state, State.FAILED)
        assert.partialDeepStrictEqual(
            JSON.parse(task.statusDescription),
            {messageKey: 'tasks.status.interrupted'}
        )
    })

    test('a canceling task without a container is canceled', async () => {
        const {repository, newSupervisor} = setup()
        await repository.add(aTask({state: State.CANCELING}))

        await newSupervisor().reconcile()

        assert.equal((await repository.getTask('t-1')).state, State.CANCELED)
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

        assert.equal((await repository.getTask('t-1')).state, State.COMPLETED)
    })

    test('a container no task is running in is removed', async () => {
        const {docker, newSupervisor} = setup()
        docker.containers.set('task.alice.gone', {taskId: 'gone', running: true})

        await newSupervisor().reconcile()

        assert.equal(docker.containers.has('task.alice.gone'), false)
    })

    test('a container without a task id is removed, and does not stop the rest of the reconcile', async () => {
        const {docker, newSupervisor} = setup()
        docker.containers.set('unlabelled-1', {running: true})
        docker.containers.set('unlabelled-2', {running: false})
        docker.containers.set('task.alice.gone', {taskId: 'gone', running: true})

        await newSupervisor().reconcile()

        assert.deepEqual([...docker.containers.keys()], [])
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

        assert.equal((await repository.getTask('t-1')).state, State.ACTIVE)
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
        assert.equal(task.state, State.FAILED)
        assert.partialDeepStrictEqual(JSON.parse(task.statusDescription), {messageKey: 'tasks.status.stalled'})
        assert.deepEqual(docker.killed, ['task.alice.t-1'])
    })

    test('a cancellation the container does not finish in time is forced', async () => {
        const {supervisor, repository, docker, clock} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()
        await repository.transition(await repository.getTask('t-1'), {from: [State.ACTIVE], to: State.CANCELING})

        clock.advance(6 * 60 * 1000)
        await supervisor.enforceTimeouts()
        await supervisor.idle()

        assert.equal((await repository.getTask('t-1')).state, State.CANCELED)
        assert.deepEqual(docker.killed, ['task.alice.t-1'])
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

        assert.equal((await repository.getTask('t-1')).state, State.CANCELING)
        assert.deepEqual(docker.killed, [])
    })
})

describe('per-user limit', () => {
    test('a user at the limit waits while a later task of another user starts', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrentPerUser: 1})
        await repository.insert(aTask({id: 't-1', creationTime: new Date(1000)}))
        await repository.insert(aTask({id: 't-2', creationTime: new Date(2000)}))
        await repository.insert(aTask({id: 't-3', username: 'bob', creationTime: new Date(3000)}))

        await supervisor.dispatch()

        assert.deepEqual([...docker.containers.keys()].sort(), ['task.alice.t-1', 'task.bob.t-3'])
        assert.equal((await repository.getTask('t-2')).state, State.PENDING)
    })

    test('a finished task lets the same user\'s next one start', async () => {
        const {supervisor, repository, docker} = setup({maxConcurrentPerUser: 1})
        await repository.insert(aTask({id: 't-1', creationTime: new Date(1000)}))
        await repository.insert(aTask({id: 't-2', creationTime: new Date(2000)}))
        await supervisor.dispatch()

        docker.exit('task.alice.t-1', 0)
        await supervisor.idle()

        assert.partialDeepStrictEqual(docker.containers.get('task.alice.t-2'), {running: true})
    })

    test('tasks still running from before a restart count towards the limit', async () => {
        const {repository, docker, newSupervisor} = setup({maxConcurrentPerUser: 1})
        await repository.insert(aTask({id: 't-1', state: State.ACTIVE, creationTime: new Date(1000)}))
        docker.containers.set('task.alice.t-1', {taskId: 't-1', running: true})
        await repository.insert(aTask({id: 't-2', creationTime: new Date(2000)}))

        await newSupervisor().dispatch()

        assert.equal((await repository.getTask('t-2')).state, State.PENDING)
    })
})

describe('local processing slots', () => {
    test('an active task is granted a free slot, and refused once all are taken', async () => {
        const {supervisor, repository} = await withRunningTasks({maxConcurrentLocalProcessing: 1})

        assert.notEqual(await supervisor.requestSlot(await repository.getTask('t-1')), null)
        assert.equal(await supervisor.requestSlot(await repository.getTask('t-2')), null)
    })

    test('a task asking again keeps its slot, under a new grant', async () => {
        const {supervisor, repository, clock} = await withRunningTasks({maxConcurrentLocalProcessing: 1})
        const first = await supervisor.requestSlot(await repository.getTask('t-1'))
        clock.advance(1000)

        const again = await supervisor.requestSlot(await repository.getTask('t-1'))

        assert.notEqual(again, null)
        assert.notDeepEqual(again, first)
        assert.equal(await supervisor.requestSlot(await repository.getTask('t-2')), null)
    })

    test('a release naming an earlier grant leaves the newer one in place', async () => {
        const {supervisor, repository, clock} = await withRunningTasks({maxConcurrentLocalProcessing: 1})
        const earlier = await supervisor.requestSlot(await repository.getTask('t-1'))
        clock.advance(1000)
        await supervisor.requestSlot(await repository.getTask('t-1'))

        await supervisor.releaseSlot(await repository.getTask('t-1'), earlier)

        assert.equal(await supervisor.requestSlot(await repository.getTask('t-2')), null)
    })

    test('a release of a slot no longer held keeps a waiting task\'s place in line', async () => {
        const {supervisor, repository, clock} = setup({maxConcurrentLocalProcessing: 1})
        for (const id of ['t-1', 't-2', 't-3']) {
            await repository.add(aTask({id}))
        }
        await supervisor.dispatch()
        const held = await supervisor.requestSlot(await repository.getTask('t-1'))
        await supervisor.requestSlot(await repository.getTask('t-2'))
        clock.advance(1000)
        await supervisor.requestSlot(await repository.getTask('t-3'))

        await supervisor.releaseSlot(await repository.getTask('t-2'), new Date(0))
        await supervisor.releaseSlot(await repository.getTask('t-1'), held)

        assert.equal(await supervisor.requestSlot(await repository.getTask('t-3')), null)
        assert.notEqual(await supervisor.requestSlot(await repository.getTask('t-2')), null)
    })

    test('a task that is not active is refused', async () => {
        const {supervisor, repository} = await withRunningTasks()
        await repository.transition(await repository.getTask('t-1'), {from: [State.ACTIVE], to: State.CANCELING})

        assert.equal(await supervisor.requestSlot(await repository.getTask('t-1')), null)
    })

    test('a released slot goes to the next task', async () => {
        const {supervisor, repository} = await withRunningTasks({maxConcurrentLocalProcessing: 1})
        const held = await supervisor.requestSlot(await repository.getTask('t-1'))
        await supervisor.requestSlot(await repository.getTask('t-2'))

        await supervisor.releaseSlot(await repository.getTask('t-1'), held)

        assert.notEqual(await supervisor.requestSlot(await repository.getTask('t-2')), null)
    })

    test('a task cancelled while holding a slot keeps it until its container exits', async () => {
        const {supervisor, repository, docker} = await withRunningTasks({maxConcurrentLocalProcessing: 1})
        await supervisor.requestSlot(await repository.getTask('t-1'))
        await repository.transition(await repository.getTask('t-1'), {from: [State.ACTIVE], to: State.CANCELING})

        assert.equal(await supervisor.requestSlot(await repository.getTask('t-2')), null)
        docker.exit('task.alice.t-1', 0)
        await supervisor.idle()

        assert.notEqual(await supervisor.requestSlot(await repository.getTask('t-2')), null)
    })

    test('a stalled container that is killed frees its slot', async () => {
        const {supervisor, repository, clock} = await withRunningTasks({maxConcurrentLocalProcessing: 1})
        await supervisor.requestSlot(await repository.getTask('t-1'))
        clock.advance(16 * 60 * 1000)
        await repository.recordProgress(await repository.getTask('t-2'), '{}')

        await supervisor.enforceTimeouts()
        await supervisor.idle()

        assert.equal((await repository.getTask('t-1')).state, State.FAILED)
        assert.notEqual(await supervisor.requestSlot(await repository.getTask('t-2')), null)
    })

    test('a slot request or release that fails reaches the caller, so the container can try again', async () => {
        const {supervisor, repository} = await withRunningTasks()
        repository.slotHolders = async () => {
            throw new Error('connection lost')
        }
        repository.releaseSlot = async () => {
            throw new Error('connection lost')
        }

        await assert.rejects(supervisor.requestSlot(await repository.getTask('t-1')), /connection lost/)
        await assert.rejects(
            supervisor.releaseSlot(await repository.getTask('t-1'), new Date(0)),
            /connection lost/
        )
    })

    test('slots held before a restart still count', async () => {
        const {supervisor, newSupervisor, repository} = await withRunningTasks({maxConcurrentLocalProcessing: 1})
        await supervisor.requestSlot(await repository.getTask('t-1'))

        const restarted = newSupervisor()
        await restarted.reconcile()

        assert.equal(await restarted.requestSlot(await repository.getTask('t-2')), null)
    })
})

describe('stopping', () => {
    test('stopping a container asks Docker to stop it with a grace period, without waiting for it to exit', async () => {
        const {supervisor, repository, docker} = setup()
        await repository.add(aTask())
        await supervisor.dispatch()

        await supervisor.stopContainer(await repository.getTask('t-1'))

        assert.deepEqual(docker.stopped, [{name: 'task.alice.t-1', seconds: 120}])
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

        assert.deepEqual(docker.stopped, [{name: 'task.alice.t-1', seconds: 120}])
    })
})

// --- harness ---

const withRunningTasks = async options => {
    const context = setup(options)
    await context.repository.add(aTask({id: 't-1', creationTime: new Date(1000)}))
    await context.repository.add(aTask({id: 't-2', creationTime: new Date(2000)}))
    await context.supervisor.dispatch()
    return context
}

const aTask = overrides => createTask({
    id: 't-1', state: State.PENDING, username: 'alice', operation: 'image.GEE', params: {},
    creationTime: new Date(1000), updateTime: new Date(1000), ...overrides
})

const setup = ({maxConcurrent = 10, maxConcurrentPerUser = 10, maxConcurrentLocalProcessing = 10} = {}) => {
    const clock = fakeClock()
    const repository = new InMemoryRepository(clock)
    const docker = new FakeDocker()
    const workspace = new FakeWorkspace()
    const newSupervisor = () => new ContainerSupervisor({
        repository,
        docker,
        workspace,
        spec: ({task, apiKey}) => ({name: containerName(task), taskId: task.id, apiKey}),
        config: {maxConcurrent, maxConcurrentPerUser, maxConcurrentLocalProcessing, stallTimeoutMs: 15 * 60 * 1000, cancelTimeoutMs: 5 * 60 * 1000, stopGraceSeconds: 120, clock: clock.now}
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
    failRemove = false
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
        if (this.failRemove) {
            throw new Error('socket hang up')
        }
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
