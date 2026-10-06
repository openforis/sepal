import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {createTask, State, StateDescription} from './task.js'
import {TaskRepository} from './taskRepository.js'

const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')

describe('TaskRepository', () => {
    let testDb
    let now
    let changed
    let repository

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'task_manager_repository', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        now = new Date('2026-10-06T10:00:00.000Z')
        changed = []
        repository = new TaskRepository(testDb.db, {clock: () => now, onChange: username => changed.push(username)})
    })

    afterAll(() => testDb?.remove())

    test('loads an inserted task back, params and all', async () => {
        const task = aTask({params: {image: {recipe: {type: 'MOSAIC'}}}})

        await repository.insert(task)

        expect(await repository.getTask(task.id)).toMatchObject({id: task.id, state: State.PENDING, params: task.params, statusDescription: StateDescription.PENDING})
    })

    test('answers nothing for a task it does not hold', async () => {
        expect(await repository.getTask('no-such-task')).toBeNull()
    })

    test('hands out pending tasks oldest first', async () => {
        const later = aTask({id: 't-2', creationTime: new Date('2026-10-06T09:00:01.000Z')})
        const earlier = aTask({id: 't-1', creationTime: new Date('2026-10-06T09:00:00.000Z')})
        await repository.insert(later)
        await repository.insert(earlier)

        expect((await repository.pendingTasks(10)).map(({id}) => id)).toEqual(['t-1', 't-2'])
    })

    test('activates a pending task once, with the hash of its key', async () => {
        const task = aTask()
        await repository.insert(task)

        expect(await repository.activate(task, 'a'.repeat(64))).toBe(true)
        expect(await repository.activate(task, 'b'.repeat(64))).toBe(false)
        expect(await repository.findByApiKeyHash('a'.repeat(64))).toMatchObject({id: task.id, state: State.ACTIVE})
    })

    test('a transition from a state the task is no longer in changes nothing', async () => {
        const task = aTask()
        await repository.insert(task)
        await repository.activate(task, 'a'.repeat(64))
        await repository.transition(task, {from: [State.ACTIVE], to: State.COMPLETED})

        expect(await repository.transition(task, {from: [State.ACTIVE, State.CANCELING], to: State.FAILED})).toBe(false)
        expect((await repository.getTask(task.id)).state).toBe(State.COMPLETED)
    })

    test('a finished task\'s key authenticates nothing', async () => {
        const task = aTask()
        await repository.insert(task)
        await repository.activate(task, 'a'.repeat(64))
        await repository.transition(task, {from: [State.ACTIVE], to: State.COMPLETED})

        expect(await repository.findByApiKeyHash('a'.repeat(64))).toBeNull()
    })

    test('records progress only for an active task, and stalls are measured from it', async () => {
        const task = aTask()
        await repository.insert(task)
        await repository.activate(task, 'a'.repeat(64))
        const progress = JSON.stringify({messageKey: 'tasks.ee.export.running', defaultMessage: 'Exporting'})

        expect(await repository.recordProgress(task, progress)).toBe(true)
        now = new Date('2026-10-06T10:20:00.000Z')

        expect((await repository.stalledTasks(new Date('2026-10-06T10:05:00.000Z'))).map(({id}) => id)).toEqual([task.id])
        await repository.resetProgressClock()
        expect(await repository.stalledTasks(new Date('2026-10-06T10:05:00.000Z'))).toEqual([])
        expect((await repository.getTask(task.id)).statusDescription).toBe(progress)
    })

    test('cancellations are timed from the last change, which a restart resets', async () => {
        const task = aTask()
        await repository.insert(task)
        await repository.activate(task, 'a'.repeat(64))
        await repository.transition(task, {from: [State.ACTIVE], to: State.CANCELING})
        now = new Date('2026-10-06T10:20:00.000Z')

        expect((await repository.cancelingSince(new Date('2026-10-06T10:05:00.000Z'))).map(({id}) => id)).toEqual([task.id])
        await repository.resetProgressClock()
        expect(await repository.cancelingSince(new Date('2026-10-06T10:05:00.000Z'))).toEqual([])
        expect((await repository.getTask(task.id)).state).toBe(State.CANCELING)
    })

    test('lists a user\'s tasks until removed, and removes only finished ones in bulk', async () => {
        const running = aTask({id: 't-1'})
        const done = aTask({id: 't-2'})
        await repository.insert(running)
        await repository.insert(done)
        await repository.activate(done, 'c'.repeat(64))
        await repository.transition(done, {from: [State.ACTIVE], to: State.FAILED})

        await repository.removeFinishedUserTasks('alice')

        expect((await repository.userTasks('alice')).map(({id}) => id)).toEqual(['t-1'])
    })

    test('counts running tasks of given operations and leaves others out of pending', async () => {
        const local = aTask({id: 't-1', operation: 'image.SEPAL', creationTime: new Date('2026-10-06T09:00:00.000Z')})
        const remote = aTask({id: 't-2', operation: 'image.GEE', creationTime: new Date('2026-10-06T09:00:01.000Z')})
        await repository.insert(local)
        await repository.insert(remote)

        expect((await repository.pendingTasks(10, {excludeOperations: ['image.SEPAL']})).map(({id}) => id)).toEqual(['t-2'])
        await repository.activate(local, 'a'.repeat(64))
        expect(await repository.countRunning({operations: ['image.SEPAL']})).toBe(1)
        expect(await repository.countRunning({operations: ['image.GEE']})).toBe(0)
        expect(await repository.countRunning()).toBe(1)
    })

    test('announces every write for the task\'s owner', async () => {
        const task = aTask()

        await repository.insert(task)
        await repository.activate(task, 'a'.repeat(64))

        expect(changed).toEqual(['alice', 'alice'])
    })

    const aTask = overrides => createTask({
        id: 't-1',
        state: State.PENDING,
        username: 'alice',
        operation: 'image.GEE',
        params: {},
        creationTime: now,
        updateTime: now,
        ...overrides
    })
})
