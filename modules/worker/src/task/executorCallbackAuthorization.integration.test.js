import {EventEmitter} from 'events'

import * as server from '#sepal/httpServer'
import {configureNoLogging} from '#sepal/log'

import {createRoutes} from '../routes.js'
import {TASK_EXECUTOR} from '../workerInstance/workerTypes.js'
import {createTask, State} from './task.js'
import {createTaskManager} from './taskManager.js'
import {createTasksApi} from './tasksApi.js'

// Which executor may report on which task, over real HTTP through the module's own routes, guards,
// handlers and UpdateTaskProgress. Only persistence and the session manager are substituted.

const ALICE_TASK = 'alice-task'
const ALICES_OTHER_TASK = 'alices-other-task'
const BOB_TASK = 'bob-task'

const ALICES_EXECUTOR = 'alices-executor'
const ALICES_OTHER_EXECUTOR = 'alices-other-executor'
const BOBS_EXECUTOR = 'bobs-executor'

describe('a task-executor callback', () => {
    let running
    let baseUrl
    let tasks
    let closedSessions
    let extendedSessions

    beforeAll(async () => {
        configureNoLogging()
        running = await startWorker()
        baseUrl = `http://127.0.0.1:${running.address().port}`
    })

    afterAll(() => running && new Promise(resolve => running.close(resolve)))

    beforeEach(() => {
        tasks = {
            [ALICE_TASK]: aTask({id: ALICE_TASK, username: 'alice', sessionId: ALICES_EXECUTOR}),
            [ALICES_OTHER_TASK]: aTask({
                id: ALICES_OTHER_TASK, username: 'alice', sessionId: ALICES_OTHER_EXECUTOR
            }),
            [BOB_TASK]: aTask({id: BOB_TASK, username: 'bob', sessionId: BOBS_EXECUTOR}),
        }
        closedSessions = []
        extendedSessions = []
    })

    describe('reporting a state change', () => {
        test('is accepted from the executor the task is assigned to', async () => {
            const status = await stateUpdated(ALICE_TASK, {
                username: 'alice', sessionId: ALICES_EXECUTOR, state: State.COMPLETED
            })

            expect(status).toBe(204)
            expect(tasks[ALICE_TASK].state).toBe(State.COMPLETED)
        })

        test.each([
            ['another user', {username: 'bob', sessionId: BOBS_EXECUTOR}],
            ['another session of the same user', {username: 'alice', sessionId: ALICES_OTHER_EXECUTOR}],
        ])('is refused from %s, leaving the task and its session alone', async (_case, caller) => {
            const status = await stateUpdated(ALICE_TASK, {...caller, state: State.COMPLETED})

            expect(status).toBe(403)
            expect(tasks[ALICE_TASK].state).toBe(State.ACTIVE)
            expect(closedSessions).toEqual([])
            expect(extendedSessions).toEqual([])
        })

        test.each([
            ['an interactive sandbox session', {username: 'alice', sessionId: ALICES_EXECUTOR, workerType: 'sandbox'}],
            ['ordinary browser credentials', {username: 'alice', sessionId: null}],
            ['an administrator', {username: 'alice', sessionId: null, roles: ['application_admin']}],
        ])('is refused from %s before it reaches the task at all', async (_case, caller) => {
            const status = await stateUpdated(ALICE_TASK, {...caller, state: State.COMPLETED})

            expect(status).toBe(403)
            expect(tasks[ALICE_TASK].state).toBe(State.ACTIVE)
        })

        test('is refused with no credentials at all', async () => {
            const response = await fetch(`${baseUrl}/tasks/task/${ALICE_TASK}/state-updated`, {method: 'POST'})

            expect(response.status).toBe(401)
            expect(tasks[ALICE_TASK].state).toBe(State.ACTIVE)
        })
    })

    describe('reporting progress for a batch', () => {
        test('is accepted for every task the calling executor holds', async () => {
            tasks[ALICES_OTHER_TASK] = aTask({
                id: ALICES_OTHER_TASK, username: 'alice', sessionId: ALICES_EXECUTOR
            })

            const status = await active([ALICE_TASK, ALICES_OTHER_TASK], {
                username: 'alice', sessionId: ALICES_EXECUTOR
            })

            expect(status).toBe(204)
            expect(tasks[ALICE_TASK].statusDescription).toContain(ALICE_TASK)
            expect(tasks[ALICES_OTHER_TASK].statusDescription).toContain(ALICES_OTHER_TASK)
        })

        // Every entry is checked, not just the first.
        test('is refused for another session\'s task even behind the caller\'s own', async () => {
            const untouched = tasks[BOB_TASK]

            const status = await active([ALICE_TASK, BOB_TASK], {
                username: 'alice', sessionId: ALICES_EXECUTOR
            })

            expect(status).toBe(403)
            expect(tasks[BOB_TASK]).toBe(untouched)
        })
    })

    // A session's key lives exactly as long as the session.
    describe('completing a task', () => {
        test('leaves the session open while it still has work', async () => {
            tasks[ALICES_OTHER_TASK] = aTask({
                id: ALICES_OTHER_TASK, username: 'alice', sessionId: ALICES_EXECUTOR
            })

            await stateUpdated(ALICE_TASK, {
                username: 'alice', sessionId: ALICES_EXECUTOR, state: State.COMPLETED
            })

            expect(closedSessions).toEqual([])
            expect(extendedSessions).toEqual([ALICES_EXECUTOR])
        })

        test('closes the session once it was the last', async () => {
            await stateUpdated(ALICE_TASK, {
                username: 'alice', sessionId: ALICES_EXECUTOR, state: State.COMPLETED
            })

            expect(closedSessions).toEqual([ALICES_EXECUTOR])
        })
    })

    // The requests the task executor actually sends: a form body for a state change, a JSON string
    // in the query for a progress batch.
    const stateUpdated = async (taskId, {state, ...caller}) => {
        const response = await fetch(`${baseUrl}/tasks/task/${taskId}/state-updated`, {
            method: 'POST',
            headers: {
                ...headersFor(caller),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({state, statusDescription: `${state} ${taskId}`})
        })
        return response.status
    }

    const active = async (taskIds, caller) => {
        const progress = Object.fromEntries(taskIds.map(id => [id, {defaultMessage: id}]))
        const url = `${baseUrl}/tasks/active?progress=${encodeURIComponent(JSON.stringify(progress))}`
        const response = await fetch(url, {method: 'POST', headers: headersFor(caller)})
        return response.status
    }

    const startWorker = () => server.start({
        port: 0,
        routes: createRoutes({tasksApi: createTasksApi({taskManager: taskManager()})}),
        // The default collects process-wide Prometheus metrics, which this has nothing to say about.
        metricsMiddleware: (_ctx, next) => next()
    })

    const taskManager = () => createTaskManager({
        repo: taskStore(),
        sessionManager: {
            closeSession: async ({sessionId}) => closedSessions.push(sessionId),
            taskExtension: async sessionId => extendedSessions.push(sessionId),
        },
        workerGateway: {execute: async () => {}, cancel: async () => {}},
        clock: () => NOW,
        sessionEvents: new EventEmitter(),
    })

    const taskStore = () => ({
        getTask: async id => {
            const task = tasks[id]
            if (!task) {
                throw new Error(`Non-existing task: ${id}`)
            }
            return task
        },
        update: async task => {
            tasks[task.id] = task
            return task
        },
        hasUnfinishedTasksInSession: async sessionId =>
            Object.values(tasks).some(task => task.sessionId === sessionId
                && [State.PENDING, State.ACTIVE, State.CANCELING].includes(task.state)),
    })
})

const NOW = new Date('2026-09-14T00:00:00Z')

const aTask = overrides => createTask({
    state: State.ACTIVE,
    operation: 'download',
    params: {},
    creationTime: NOW,
    updateTime: NOW,
    ...overrides,
})

// The headers the gateway injects: the authenticated user, and the worker session its api key
// resolved to.
const headersFor = ({username, sessionId, workerType = TASK_EXECUTOR, roles = []}) => ({
    'sepal-user': JSON.stringify({username, roles}),
    ...(sessionId ? {'sepal-session': JSON.stringify({sessionId, workerType})} : {}),
})
