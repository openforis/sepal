import {EventEmitter} from 'events'
import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {MINUTE_MS} from '../time.js'
import {createTask, State} from './task.js'
import {createTaskManager} from './taskManager.js'
import {TaskRepository} from './taskRepository.js'

// How long an executor session lives while its tasks are cancelled: the task manager's commands over
// the real TaskRepository and MySQL. The executor session is a stateful fake whose credential lives
// exactly as long as the session, as the gateway resolves an executor's key only while its session is
// open.

describe('an executor session', () => {
    let testDb
    let now
    let sessions
    let dispatched
    let cancelRequests
    let repository
    let manager

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'worker_executor_session', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        now = new Date('2026-07-01T12:00:00Z')
        sessions = new ExecutorSessions()
        dispatched = []
        cancelRequests = []
        repository = new TaskRepository(testDb.db, () => now)
        manager = createTaskManager({
            repo: repository,
            sessionManager: sessions,
            workerGateway: {
                execute: async task => { dispatched.push(task.id) },
                cancel: async taskId => { cancelRequests.push(taskId) }
            },
            clock: () => now,
            sessionEvents: new EventEmitter()
        })
    })

    afterAll(() => testDb?.remove())

    describe('with two running tasks, both cancelled', () => {
        beforeEach(async () => {
            sessions.open(SESSION_ID)
            await givenTask({id: FIRST, state: State.ACTIVE})
            await givenTask({id: SECOND, state: State.ACTIVE})
            await manager.cancelTask({taskId: FIRST, username: USERNAME})
            await manager.cancelTask({taskId: SECOND, username: USERNAME})
        })

        test('stays open once the first cancellation is confirmed', async () => {
            await executorReports(FIRST, State.CANCELED)

            expect(await stateOf(FIRST)).toBe(State.CANCELED)
            expect(await stateOf(SECOND)).toBe(State.CANCELING)
            expect(sessions.isOpen(SESSION_ID)).toBe(true)
        })

        test('accepts the second confirmation, then closes', async () => {
            await executorReports(FIRST, State.CANCELED)

            const accepted = await executorReports(SECOND, State.CANCELED)

            expect(accepted).toBe(true)
            expect(await stateOf(SECOND)).toBe(State.CANCELED)
            expect(sessions.isOpen(SESSION_ID)).toBe(false)
        })

        test('is closed by timeout recovery when the second confirmation never arrives', async () => {
            await executorReports(FIRST, State.CANCELED)
            now = new Date(now.getTime() + 3 * MINUTE_MS)
            expect(sessions.isOpen(SESSION_ID)).toBe(true)

            await manager.cancelTimedOutTasks()

            expect(await stateOf(SECOND)).toBe(State.CANCELED)
            expect(sessions.isOpen(SESSION_ID)).toBe(false)
        })
    })

    test('is kept open by a cancellation still awaited when timeout recovery settles another', async () => {
        sessions.open(SESSION_ID)
        await givenTask({id: FIRST, state: State.ACTIVE})
        await givenTask({id: SECOND, state: State.ACTIVE})
        await manager.cancelTask({taskId: FIRST, username: USERNAME})
        now = new Date(now.getTime() + 2 * MINUTE_MS)
        await manager.cancelTask({taskId: SECOND, username: USERNAME})
        now = new Date(now.getTime() + MINUTE_MS)

        await manager.cancelTimedOutTasks()

        expect(await stateOf(FIRST)).toBe(State.CANCELED)
        expect(await stateOf(SECOND)).toBe(State.CANCELING)
        expect(sessions.isOpen(SESSION_ID)).toBe(true)
    })

    test('is kept open by a cancellation still awaited when another task fails to start', async () => {
        sessions.open(SESSION_ID)
        await givenTask({id: FIRST, state: State.ACTIVE})
        await givenTask({id: SECOND, state: State.PENDING})
        await manager.cancelTask({taskId: FIRST, username: USERNAME})
        const failingManager = createTaskManager({
            repo: repository,
            sessionManager: sessions,
            workerGateway: {execute: async () => { throw new Error('Unreachable') }, cancel: async () => {}},
            clock: () => now,
            sessionEvents: new EventEmitter()
        })

        await failingManager.executeTasksInSession(sessions.findSession(SESSION_ID))

        expect(await stateOf(SECOND)).toBe(State.FAILED)
        expect(sessions.isOpen(SESSION_ID)).toBe(true)
    })

    // The executor's progress heartbeat still reports a task it has not yet stopped. Each report asks
    // it to cancel again, but only the first request starts the cancellation's deadline.
    test('is closed at the first cancellation deadline, however long the executor reports the task running', async () => {
        sessions.open(SESSION_ID)
        await givenTask({id: FIRST, state: State.ACTIVE})
        await manager.cancelTask({taskId: FIRST, username: USERNAME})
        now = new Date(now.getTime() + 90_000)
        await executorReports(FIRST, State.ACTIVE)
        now = new Date(now.getTime() + 60_000)

        await manager.cancelTimedOutTasks()

        expect(cancelRequests).toEqual([FIRST, FIRST])
        expect(await stateOf(FIRST)).toBe(State.CANCELED)
        expect(sessions.isOpen(SESSION_ID)).toBe(false)
    })

    test('does not dispatch a cancelled task again when it becomes active', async () => {
        await givenTask({id: FIRST, state: State.PENDING})
        await givenTask({id: SECOND, state: State.PENDING})
        await manager.cancelTask({taskId: SECOND, username: USERNAME})
        sessions.open(SESSION_ID)

        await manager.executeTasksInSession(sessions.findSession(SESSION_ID))

        expect(dispatched).toEqual([FIRST])
        expect(await stateOf(SECOND)).toBe(State.CANCELING)
    })

    // The task executor's state-updated callback, as the gateway admits it: only while the session
    // its key belongs to is open.
    const executorReports = async (taskId, state) => {
        if (!sessions.isOpen(SESSION_ID)) {
            return false
        }
        await manager.updateTaskProgress({taskId, state, username: USERNAME, sessionId: SESSION_ID})
        return true
    }

    const stateOf = async taskId => (await manager.getTask({taskId, username: USERNAME})).state

    const givenTask = ({id, state}) => repository.insert(createTask({
        id, state, username: USERNAME, sessionId: SESSION_ID, operation: 'export', creationTime: now, updateTime: now
    }))
})

// Closing is idempotent, as the real CloseSession is for a session no longer open.
class ExecutorSessions {
    #open = new Set()

    open(sessionId) {
        this.#open.add(sessionId)
    }

    isOpen(sessionId) {
        return this.#open.has(sessionId)
    }

    findSession(sessionId) {
        return {id: sessionId, username: USERNAME, host: 'executor-host', state: this.isOpen(sessionId) ? 'ACTIVE' : 'CLOSED'}
    }

    async findSessionById(sessionId) {
        return this.findSession(sessionId)
    }

    async closeSession({sessionId}) {
        this.#open.delete(sessionId)
    }

    async taskExtension() {
        return true
    }
}

const FIRST = 'first-export'
const SECOND = 'second-export'
const USERNAME = 'alice'
const SESSION_ID = 'executor-session'

const MIGRATIONS_PATH = join(dirName(import.meta.url), '../../migrations')
