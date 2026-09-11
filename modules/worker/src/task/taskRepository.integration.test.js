import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {EventEmittingTaskRepository} from './events.js'
import {createTask, State, StateDescription} from './task.js'
import {TaskRepository} from './taskRepository.js'

// The clock is pinned, so the three staleness thresholds are exact rather than approximate. `removed`
// is a soft delete no read returns, so what it hides is observed through the reads that filter on it.

describe('TaskRepository', () => {
    let testDb
    let repository
    let now

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'worker_task', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        now = new Date('2026-07-01T12:00:00Z')
        repository = new TaskRepository(testDb.db, () => now)
    })

    afterAll(() => testDb?.remove())

    describe('insert', () => {
        test('stores a task with its parameters and its recipe', async () => {
            await repository.insert(aTask({params: {foo: 'bar', count: 3}, recipeId: RECIPE_ID}))

            const stored = await repository.getTask(TASK_ID)
            expect(stored.id).toBe(TASK_ID)
            expect(stored.state).toBe(State.PENDING)
            expect(stored.username).toBe(USERNAME)
            expect(stored.sessionId).toBe(SESSION_ID)
            expect(stored.operation).toBe(OPERATION)
            expect(stored.params).toEqual({foo: 'bar', count: 3})
            expect(stored.recipeId).toBe(RECIPE_ID)
        })

        test('stores the username in lowercase', async () => {
            await repository.insert(aTask({username: 'Bob'}))

            const stored = await repository.getTask(TASK_ID)
            expect(stored.username).toBe(USERNAME)
        })

        test('stores a task that belongs to no recipe', async () => {
            await repository.insert(aTask({recipeId: null}))

            const stored = await repository.getTask(TASK_ID)
            expect(stored.recipeId).toBeNull()
        })

        test('falls back to the state\'s own description when the task has none', async () => {
            await repository.insert(aTask({statusDescription: null}))

            const stored = await repository.getTask(TASK_ID)
            expect(stored.statusDescription).toEqual(StateDescription.PENDING)
        })
    })

    describe('getTask', () => {
        test('refuses to answer for a task that does not exist', async () => {
            await expect(repository.getTask('nothing')).rejects.toThrow('Non-existing task: nothing')
        })
    })

    describe('update', () => {
        test('records the new state and description, stamped with the time of the update', async () => {
            const task = aTask()
            await repository.insert(task)
            now = new Date('2026-07-01T12:30:00Z')

            await repository.update({...task, state: State.ACTIVE, statusDescription: StateDescription.ACTIVE})

            const stored = await repository.getTask(TASK_ID)
            expect(stored.state).toBe(State.ACTIVE)
            expect(stored.statusDescription).toEqual(StateDescription.ACTIVE)
            expect(stored.updateTime.getTime()).toBe(now.getTime())
            expect(stored.updateTime.getTime()).toBeGreaterThan(task.updateTime.getTime())
        })
    })

    describe('remove', () => {
        test('hides the task from the user\'s tasks', async () => {
            await repository.insert(aTask())

            await repository.remove(aTask())

            const listed = await repository.userTasks(USERNAME)
            const stored = await repository.getTask(TASK_ID)
            expect(listed).toEqual([])
            expect(stored.id).toBe(TASK_ID)
        })
    })

    describe('removeNonPendingOrActiveUserTasks', () => {
        test('hides only the user\'s finished tasks', async () => {
            await repository.insert(aTask({id: 'pending', state: State.PENDING}))
            await repository.insert(aTask({id: 'active', state: State.ACTIVE}))
            await repository.insert(aTask({id: 'completed', state: State.COMPLETED}))
            await repository.insert(aTask({id: 'failed', state: State.FAILED}))
            await repository.insert(aTask({id: 'another-user', username: ANOTHER_USERNAME, state: State.COMPLETED}))

            await repository.removeNonPendingOrActiveUserTasks(USERNAME)

            const listed = await repository.userTasks(USERNAME)
            const otherListed = await repository.userTasks(ANOTHER_USERNAME)
            expect(listed.map(({id}) => id).sort()).toEqual(['active', 'pending'])
            expect(otherListed.map(({id}) => id)).toEqual(['another-user'])
        })
    })

    describe('timedOutTasks', () => {
        // Each state gets its own patience: 10 minutes pending, 5 active, 2 canceling.
        test('reports a task whose state has waited longer than that state allows', async () => {
            await givenTaskLastUpdated('pending-stale', State.PENDING, minutesAgo(11))
            await givenTaskLastUpdated('pending-fresh', State.PENDING, minutesAgo(9))
            await givenTaskLastUpdated('active-stale', State.ACTIVE, minutesAgo(6))
            await givenTaskLastUpdated('active-fresh', State.ACTIVE, minutesAgo(4))
            await givenTaskLastUpdated('canceling-stale', State.CANCELING, minutesAgo(3))
            await givenTaskLastUpdated('canceling-fresh', State.CANCELING, minutesAgo(1))

            const timedOut = await repository.timedOutTasks()

            expect(timedOut.map(({id}) => id).sort()).toEqual(['active-stale', 'canceling-stale', 'pending-stale'])
        })

        // The same age is stale for one state and fresh for another — the thresholds are not shared.
        test('applies each state\'s own threshold to the same age', async () => {
            await givenTaskLastUpdated('pending', State.PENDING, minutesAgo(6))
            await givenTaskLastUpdated('active', State.ACTIVE, minutesAgo(6))

            const timedOut = await repository.timedOutTasks()

            expect(timedOut.map(({id}) => id)).toEqual(['active'])
        })

        test('never reports a task that has already finished, however old', async () => {
            await givenTaskLastUpdated('completed', State.COMPLETED, minutesAgo(600))
            await givenTaskLastUpdated('canceled', State.CANCELED, minutesAgo(600))
            await givenTaskLastUpdated('failed', State.FAILED, minutesAgo(600))

            const timedOut = await repository.timedOutTasks()

            expect(timedOut).toEqual([])
        })
    })

    describe('pendingOrActiveTasksInSession', () => {
        test('reports the unfinished tasks of that session alone', async () => {
            await repository.insert(aTask({id: 'pending', state: State.PENDING}))
            await repository.insert(aTask({id: 'active', state: State.ACTIVE}))
            await repository.insert(aTask({id: 'completed', state: State.COMPLETED}))
            await repository.insert(aTask({id: 'other-session', sessionId: 's-other', state: State.ACTIVE}))

            const tasks = await repository.pendingOrActiveTasksInSession(SESSION_ID)

            expect(tasks.map(({id}) => id).sort()).toEqual(['active', 'pending'])
        })
    })

    describe('userTasks', () => {
        test('lists the user\'s tasks oldest first', async () => {
            await repository.insert(aTask({id: 'later', creationTime: minutesAgo(1)}))
            await repository.insert(aTask({id: 'earlier', creationTime: minutesAgo(10)}))

            const tasks = await repository.userTasks(USERNAME)

            expect(tasks.map(({id}) => id)).toEqual(['earlier', 'later'])
        })
    })

    describe('pendingOrActiveUserTasks', () => {
        test('reports the user\'s unfinished tasks alone', async () => {
            await repository.insert(aTask({id: 'pending', state: State.PENDING}))
            await repository.insert(aTask({id: 'completed', state: State.COMPLETED}))
            await repository.insert(aTask({id: 'another-user', username: ANOTHER_USERNAME, state: State.ACTIVE}))

            const tasks = await repository.pendingOrActiveUserTasks(USERNAME)

            expect(tasks.map(({id}) => id)).toEqual(['pending'])
        })
    })

    // main.js hands every caller the repository wrapped in the change-event decorator, so the whole
    // surface has to survive the wrapping — reads included, which emit nothing.
    describe('wrapped in EventEmittingTaskRepository', () => {
        test('still answers every query the repository does', async () => {
            const decorated = new EventEmittingTaskRepository(repository)
            await decorated.insert(aTask())

            const found = await decorated.getTask(TASK_ID)
            const listed = await decorated.userTasks(USERNAME)
            const inSession = await decorated.pendingOrActiveTasksInSession(SESSION_ID)
            const unfinished = await decorated.pendingOrActiveUserTasks(USERNAME)
            const timedOut = await decorated.timedOutTasks()

            expect(found.id).toBe(TASK_ID)
            expect(listed.map(({id}) => id)).toEqual([TASK_ID])
            expect(inSession.map(({id}) => id)).toEqual([TASK_ID])
            expect(unfinished.map(({id}) => id)).toEqual([TASK_ID])
            expect(timedOut).toEqual([])
        })
    })

    // A task is stale by its update_time, which only `update` writes and only with the current time.
    // Inserting the age directly is what lets one clock express every side of the three thresholds.
    const givenTaskLastUpdated = (id, state, updateTime) =>
        repository.insert(aTask({id, state, updateTime}))

    const minutesAgo = minutes => new Date(now.getTime() - minutes * 60 * 1000)

    const aTask = (over = {}) => createTask({
        id: TASK_ID,
        state: State.PENDING,
        username: USERNAME,
        sessionId: SESSION_ID,
        operation: OPERATION,
        params: {foo: 'bar'},
        statusDescription: StateDescription.PENDING,
        creationTime: now,
        updateTime: now,
        recipeId: null,
        ...over,
    })

    const TASK_ID = 't-1'
    const RECIPE_ID = 'r-1'
    const USERNAME = 'bob'
    const ANOTHER_USERNAME = 'alice'
    const SESSION_ID = 's-1'
    const OPERATION = 'some-operation'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../../migrations')
})
