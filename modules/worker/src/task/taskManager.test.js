// Unit tests for the task state machine (commands + queries + in-proc session-event consumption),
// driven through the taskManager surface with a mocked repo, mocked sessionManager, mocked
// workerGateway, and an injected EventEmitter. No database.

import {jest} from '@jest/globals'
import EventEmitter from 'events'

import {TASK_EXECUTOR} from '../workerInstance/workerTypes.js'
import {InvalidCommand, Unauthorized} from './errors.js'
import {createTask, State, StateDescription} from './task.js'
import {createTaskManager} from './taskManager.js'

const NOW = new Date('2026-07-01T00:00:00Z')
const clock = () => NOW

const task = overrides => createTask({
    id: 't-1',
    state: State.PENDING,
    username: 'alice',
    sessionId: 's-1',
    operation: 'download',
    params: {title: 'My task'},
    creationTime: NOW,
    updateTime: NOW,
    ...overrides,
})

const activeSession = overrides => ({
    id: 's-1', instanceType: 'T3aSmall', username: 'alice', host: 'host-1', state: State.ACTIVE, ...overrides,
})
const pendingSession = overrides => activeSession({state: 'PENDING', ...overrides})

// In-memory repo mock recording the call order.
const makeRepo = (canned = {}) => {
    const calls = []
    const record = (name, ...args) => calls.push({name, args})
    return {
        calls,
        insert: jest.fn(async t => { record('insert', t); return t }),
        update: jest.fn(async t => { record('update', t); return t }),
        remove: jest.fn(async t => record('remove', t)),
        removeNonPendingOrActiveUserTasks: jest.fn(async u => record('removeNonPendingOrActiveUserTasks', u)),
        getTask: jest.fn(async id => {
            record('getTask', id)
            if (canned.getTask) return canned.getTask(id)
            throw new Error(`Non-existing task: ${id}`)
        }),
        timedOutTasks: jest.fn(async () => {
            record('timedOutTasks')
            return canned.timedOutTasks ? canned.timedOutTasks() : []
        }),
        pendingOrActiveTasksInSession: jest.fn(async id => {
            record('pendingOrActiveTasksInSession', id)
            return canned.pendingOrActiveTasksInSession ? canned.pendingOrActiveTasksInSession(id) : []
        }),
        pendingOrActiveUserTasks: jest.fn(async u => {
            record('pendingOrActiveUserTasks', u)
            return canned.pendingOrActiveUserTasks ? canned.pendingOrActiveUserTasks(u) : []
        }),
        userTasks: jest.fn(async u => {
            record('userTasks', u)
            return canned.userTasks ? canned.userTasks(u) : []
        }),
    }
}

const makeSessionManager = (overrides = {}) => ({
    findPendingOrActiveSession: jest.fn(async () => null),
    requestSession: jest.fn(async () => pendingSession()),
    findSessionById: jest.fn(async () => activeSession()),
    closeSession: jest.fn(async () => null),
    heartbeat: jest.fn(async () => null),
    taskExtension: jest.fn(async () => true),
    getDefaultInstanceType: jest.fn(() => ({id: 'DEFAULT_TYPE', tag: 'default'})),
    ...overrides,
})

const makeGateway = (overrides = {}) => ({
    execute: jest.fn(async () => undefined),
    cancel: jest.fn(async () => undefined),
    ...overrides,
})

const make = ({repo, sessionManager, workerGateway, sessionEvents} = {}) => {
    const r = repo ?? makeRepo()
    const sm = sessionManager ?? makeSessionManager()
    const gw = workerGateway ?? makeGateway()
    const ev = sessionEvents ?? new EventEmitter()
    const manager = createTaskManager({repo: r, sessionManager: sm, workerGateway: gw, clock, sessionEvents: ev})
    return {manager, repo: r, sessionManager: sm, workerGateway: gw, sessionEvents: ev}
}

const flush = () => new Promise(resolve => setImmediate(resolve))

describe('submitTask', () => {
    test('existing active session → execute + task ACTIVE, no requestSession', async () => {
        const {manager, sessionManager, workerGateway, repo} = make({
            sessionManager: makeSessionManager({findPendingOrActiveSession: jest.fn(async () => activeSession())}),
        })
        const result = await manager.submitTask({username: 'alice', operation: 'download', params: {a: 1}})
        expect(sessionManager.requestSession).not.toHaveBeenCalled()
        expect(workerGateway.execute).toHaveBeenCalledTimes(1)
        // params passed to the gateway is a JSON string
        expect(workerGateway.execute.mock.calls[0][0].params).toBe(JSON.stringify({a: 1}))
        expect(result.state).toBe(State.ACTIVE)
        expect(repo.insert).toHaveBeenCalledTimes(1)
        expect(repo.insert.mock.calls[0][0].state).toBe(State.ACTIVE)
    })

    test('no existing session → requestSession, PENDING task, no execute', async () => {
        const {manager, sessionManager, workerGateway, repo} = make()
        const result = await manager.submitTask({username: 'alice', operation: 'download', params: {}})
        expect(sessionManager.requestSession).toHaveBeenCalledTimes(1)
        expect(workerGateway.execute).not.toHaveBeenCalled()
        expect(result.state).toBe(State.PENDING)
        expect(repo.insert.mock.calls[0][0].state).toBe(State.PENDING)
    })

    test('default instanceType uses getDefaultInstanceType().id and workerType TASK_EXECUTOR', async () => {
        const {manager, sessionManager} = make()
        await manager.submitTask({username: 'alice', operation: 'download', params: {}})
        const query = sessionManager.findPendingOrActiveSession.mock.calls[0][0]
        expect(query.instanceType).toBe('DEFAULT_TYPE')
        expect(query.workerType).toBe(TASK_EXECUTOR)
        expect(sessionManager.requestSession.mock.calls[0][0].instanceType).toBe('DEFAULT_TYPE')
    })

    test('explicit instanceType overrides the default', async () => {
        const {manager, sessionManager} = make()
        await manager.submitTask({username: 'alice', instanceType: 'BIG', operation: 'download', params: {}})
        expect(sessionManager.findPendingOrActiveSession.mock.calls[0][0].instanceType).toBe('BIG')
    })

    test('session-request rejection propagates', async () => {
        const {manager} = make({
            sessionManager: makeSessionManager({requestSession: jest.fn(async () => { throw new Error('budget') })}),
        })
        await expect(manager.submitTask({username: 'alice', operation: 'download', params: {}})).rejects.toThrow('budget')
    })
})

describe('executeTasksInSession', () => {
    test('executes all pending/active tasks and marks them ACTIVE', async () => {
        const tasks = [task({id: 't-1'}), task({id: 't-2'})]
        const {manager, workerGateway, repo} = make({
            repo: makeRepo({pendingOrActiveTasksInSession: () => tasks}),
        })
        await manager.executeTasksInSession(activeSession())
        expect(workerGateway.execute).toHaveBeenCalledTimes(2)
        const updated = repo.calls.filter(c => c.name === 'update').map(c => c.args[0])
        expect(updated.every(t => t.state === State.ACTIVE)).toBe(true)
    })

    test('on execute failure fails the task; closes session if none remain', async () => {
        const repo = makeRepo()
        const workerGateway = makeGateway({execute: jest.fn(async () => { throw new Error('boom') })})
        // first read returns the task; then executeTask fails it and re-reads → empty
        let firstRead = true
        repo.pendingOrActiveTasksInSession = jest.fn(async () => {
            if (firstRead) { firstRead = false; return [task({id: 't-1'})] }
            return []
        })
        const {manager, sessionManager} = make({repo, workerGateway})
        await manager.executeTasksInSession(activeSession())
        const failed = repo.update.mock.calls.map(c => c[0]).find(t => t.state === State.FAILED)
        expect(failed).toBeDefined()
        expect(sessionManager.closeSession).toHaveBeenCalledWith({sessionId: 's-1'})
    })

    test('on execute failure does NOT close session if tasks remain', async () => {
        const workerGateway = makeGateway({execute: jest.fn(async () => { throw new Error('boom') })})
        const repo = makeRepo()
        let firstRead = true
        repo.pendingOrActiveTasksInSession = jest.fn(async () => {
            if (firstRead) { firstRead = false; return [task({id: 't-1'})] }
            return [task({id: 't-2'})]
        })
        const {manager, sessionManager} = make({repo, workerGateway})
        await manager.executeTasksInSession(activeSession())
        expect(sessionManager.closeSession).not.toHaveBeenCalled()
    })
})

describe('updateTaskProgress', () => {
    test('persist happens BEFORE the side effect (the session extension) — non-terminal', async () => {
        const order = []
        const repo = makeRepo({getTask: () => task({state: State.ACTIVE})})
        repo.update = jest.fn(async t => { order.push('update'); return t })
        const sessionManager = makeSessionManager()
        sessionManager.taskExtension = jest.fn(async () => { order.push('extend') })
        const {manager} = make({repo, sessionManager})
        await manager.updateTaskProgress({taskId: 't-1', state: State.ACTIVE, statusDescription: 'x'})
        expect(order).toEqual(['update', 'extend'])
        expect(sessionManager.closeSession).not.toHaveBeenCalled()
    })

    test('terminal + empty session → closeSession after persist', async () => {
        const order = []
        const repo = makeRepo({getTask: () => task({state: State.ACTIVE}), pendingOrActiveTasksInSession: () => []})
        repo.update = jest.fn(async t => { order.push('update'); return t })
        const sessionManager = makeSessionManager()
        sessionManager.closeSession = jest.fn(async () => { order.push('closeSession') })
        const {manager} = make({repo, sessionManager})
        await manager.updateTaskProgress({taskId: 't-1', state: State.COMPLETED})
        expect(order).toEqual(['update', 'closeSession'])
        expect(sessionManager.closeSession).toHaveBeenCalledWith({sessionId: 's-1'})
        expect(sessionManager.taskExtension).not.toHaveBeenCalled()
    })

    test('terminal but tasks remain → extend, not close', async () => {
        const repo = makeRepo({
            getTask: () => task({state: State.ACTIVE}),
            pendingOrActiveTasksInSession: () => [task({id: 't-2'})],
        })
        const {manager, sessionManager} = make({repo})
        await manager.updateTaskProgress({taskId: 't-1', state: State.FAILED})
        expect(sessionManager.closeSession).not.toHaveBeenCalled()
        expect(sessionManager.taskExtension).toHaveBeenCalledWith('s-1')
    })

    test('guard (a): CANCELED while task not in [PENDING,ACTIVE,CANCELING] → no-op', async () => {
        const repo = makeRepo({getTask: () => task({state: State.COMPLETED})})
        const {manager, sessionManager} = make({repo})
        const result = await manager.updateTaskProgress({taskId: 't-1', state: State.CANCELED})
        expect(result).toBeNull()
        expect(repo.update).not.toHaveBeenCalled()
        expect(sessionManager.taskExtension).not.toHaveBeenCalled()
        expect(sessionManager.closeSession).not.toHaveBeenCalled()
    })

    test('guard (b): ACTIVE while task CANCELING → re-invoke CancelTask, no persist of ACTIVE', async () => {
        const repo = makeRepo({getTask: () => task({state: State.CANCELING})})
        const workerGateway = makeGateway()
        const {manager} = make({repo, workerGateway})
        const result = await manager.updateTaskProgress({taskId: 't-1', state: State.ACTIVE})
        expect(result).toBeNull()
        // CancelTask ran: it updated the task to CANCELING again (never ACTIVE)
        const states = repo.update.mock.calls.map(c => c[0].state)
        expect(states).not.toContain(State.ACTIVE)
        expect(states).toContain(State.CANCELING)
        // task was CANCELING (not PENDING) → executor cancel invoked
        expect(workerGateway.cancel).toHaveBeenCalled()
    })

    test('guard (c): non-CANCELED state while task not in [PENDING,ACTIVE] → no-op', async () => {
        const repo = makeRepo({getTask: () => task({state: State.CANCELING})})
        const {manager, sessionManager} = make({repo})
        const result = await manager.updateTaskProgress({taskId: 't-1', state: State.COMPLETED})
        expect(result).toBeNull()
        expect(repo.update).not.toHaveBeenCalled()
        expect(sessionManager.taskExtension).not.toHaveBeenCalled()
    })

    test('CANCELED while CANCELING → persist CANCELED (allowed)', async () => {
        const repo = makeRepo({getTask: () => task({state: State.CANCELING}), pendingOrActiveTasksInSession: () => []})
        const {manager, sessionManager} = make({repo})
        const result = await manager.updateTaskProgress({taskId: 't-1', state: State.CANCELED})
        expect(result.state).toBe(State.CANCELED)
        expect(sessionManager.closeSession).toHaveBeenCalled()
    })
})

describe('cancelTask', () => {
    test('pending task → CANCELING, no executor cancel', async () => {
        const repo = makeRepo({getTask: () => task({state: State.PENDING})})
        const {manager, workerGateway, sessionManager} = make({repo})
        const result = await manager.cancelTask({taskId: 't-1', username: 'alice'})
        expect(result.state).toBe(State.CANCELING)
        expect(workerGateway.cancel).not.toHaveBeenCalled()
        expect(sessionManager.findSessionById).not.toHaveBeenCalled()
    })

    test('active task → CANCELING + executor cancel', async () => {
        const repo = makeRepo({getTask: () => task({state: State.ACTIVE})})
        const {manager, workerGateway, sessionManager} = make({repo})
        await manager.cancelTask({taskId: 't-1', username: 'alice'})
        expect(sessionManager.findSessionById).toHaveBeenCalledWith('s-1')
        expect(workerGateway.cancel).toHaveBeenCalledWith('t-1', expect.objectContaining({host: 'host-1'}))
    })

    test('terminal task → no-op returns null', async () => {
        const repo = makeRepo({getTask: () => task({state: State.COMPLETED})})
        const {manager} = make({repo})
        expect(await manager.cancelTask({taskId: 't-1', username: 'alice'})).toBeNull()
        expect(repo.update).not.toHaveBeenCalled()
    })

    test('ownership: other user → Unauthorized', async () => {
        const repo = makeRepo({getTask: () => task({username: 'alice', state: State.ACTIVE})})
        const {manager} = make({repo})
        await expect(manager.cancelTask({taskId: 't-1', username: 'bob'})).rejects.toBeInstanceOf(Unauthorized)
    })

    test('executor cancel failure is swallowed', async () => {
        const repo = makeRepo({getTask: () => task({state: State.ACTIVE})})
        const workerGateway = makeGateway({cancel: jest.fn(async () => { throw new Error('down') })})
        const {manager} = make({repo, workerGateway})
        const result = await manager.cancelTask({taskId: 't-1', username: 'alice'})
        expect(result.state).toBe(State.CANCELING)
    })
})

describe('cancelTimedOutTasks', () => {
    test('PENDING/ACTIVE → FAILED, CANCELING → CANCELED; active → executor cancel; empty session → close', async () => {
        const timedOut = [
            task({id: 'p', state: State.PENDING, sessionId: 's-1'}),
            task({id: 'a', state: State.ACTIVE, sessionId: 's-1'}),
            task({id: 'c', state: State.CANCELING, sessionId: 's-2'}),
        ]
        const repo = makeRepo({timedOutTasks: () => timedOut, pendingOrActiveTasksInSession: () => []})
        const {manager, workerGateway, sessionManager} = make({repo})
        await manager.cancelTimedOutTasks()
        const byId = Object.fromEntries(repo.update.mock.calls.map(c => [c[0].id, c[0].state]))
        expect(byId.p).toBe(State.FAILED)
        expect(byId.a).toBe(State.FAILED)
        expect(byId.c).toBe(State.CANCELED)
        // only the ACTIVE task is canceled in the worker
        expect(workerGateway.cancel).toHaveBeenCalledTimes(1)
        expect(workerGateway.cancel).toHaveBeenCalledWith('a', expect.anything())
        // both sessions empty → both closed
        expect(sessionManager.closeSession).toHaveBeenCalledWith({sessionId: 's-1'})
        expect(sessionManager.closeSession).toHaveBeenCalledWith({sessionId: 's-2'})
    })

    test('non-transactional isolation: one failing update does not abort the rest', async () => {
        const timedOut = [task({id: 'p', state: State.PENDING}), task({id: 'a', state: State.ACTIVE})]
        const repo = makeRepo({timedOutTasks: () => timedOut, pendingOrActiveTasksInSession: () => []})
        let first = true
        repo.update = jest.fn(async t => {
            if (first) { first = false; throw new Error('db blip') }
            return t
        })
        const {manager} = make({repo})
        await expect(manager.cancelTimedOutTasks()).resolves.toBeUndefined()
        expect(repo.update).toHaveBeenCalledTimes(2)
    })

    test('session with remaining tasks is not closed', async () => {
        const timedOut = [task({id: 'p', state: State.PENDING, sessionId: 's-1'})]
        const repo = makeRepo({timedOutTasks: () => timedOut, pendingOrActiveTasksInSession: () => [task({id: 'other'})]})
        const {manager, sessionManager} = make({repo})
        await manager.cancelTimedOutTasks()
        expect(sessionManager.closeSession).not.toHaveBeenCalled()
    })
})

describe('cancelUserTasks', () => {
    test('cancels each pending/active user task', async () => {
        const tasks = [task({id: 't-1', state: State.PENDING}), task({id: 't-2', state: State.ACTIVE})]
        const repo = makeRepo({pendingOrActiveUserTasks: () => tasks, getTask: id => tasks.find(t => t.id === id)})
        const {manager} = make({repo})
        await manager.cancelUserTasks('alice')
        const canceled = repo.update.mock.calls.map(c => c[0]).filter(t => t.state === State.CANCELING)
        expect(canceled.map(t => t.id).sort()).toEqual(['t-1', 't-2'])
    })
})

describe('resubmitTask', () => {
    test('terminal task → soft-remove + resubmit with same operation/params/recipeId', async () => {
        const old = task({id: 't-old', state: State.FAILED, operation: 'download', params: {a: 1}, recipeId: 'r-1'})
        const repo = makeRepo({getTask: () => old})
        const {manager, sessionManager} = make({repo})
        const result = await manager.resubmitTask({taskId: 't-old', username: 'alice'})
        expect(repo.remove).toHaveBeenCalledWith(old)
        expect(result.operation).toBe('download')
        expect(result.recipeId).toBe('r-1')
        expect(result.state).toBe(State.PENDING) // requested a new session (pending)
        expect(sessionManager.requestSession).toHaveBeenCalled()
    })

    test('non-terminal task → InvalidCommand, not removed', async () => {
        const repo = makeRepo({getTask: () => task({state: State.ACTIVE})})
        const {manager} = make({repo})
        await expect(manager.resubmitTask({taskId: 't-1', username: 'alice'})).rejects.toBeInstanceOf(InvalidCommand)
        expect(repo.remove).not.toHaveBeenCalled()
    })

    test('ownership → Unauthorized', async () => {
        const repo = makeRepo({getTask: () => task({username: 'alice', state: State.FAILED})})
        const {manager} = make({repo})
        await expect(manager.resubmitTask({taskId: 't-1', username: 'bob'})).rejects.toBeInstanceOf(Unauthorized)
    })
})

describe('removeTask', () => {
    test('terminal task removed', async () => {
        const t = task({state: State.COMPLETED})
        const repo = makeRepo({getTask: () => t})
        const {manager} = make({repo})
        await manager.removeTask({taskId: 't-1', username: 'alice'})
        expect(repo.remove).toHaveBeenCalledWith(t)
    })

    test('non-terminal task → InvalidCommand', async () => {
        const repo = makeRepo({getTask: () => task({state: State.PENDING})})
        const {manager} = make({repo})
        await expect(manager.removeTask({taskId: 't-1', username: 'alice'})).rejects.toBeInstanceOf(InvalidCommand)
    })

    test('ownership → Unauthorized', async () => {
        const repo = makeRepo({getTask: () => task({username: 'alice', state: State.COMPLETED})})
        const {manager} = make({repo})
        await expect(manager.removeTask({taskId: 't-1', username: 'bob'})).rejects.toBeInstanceOf(Unauthorized)
    })
})

describe('removeUserTasks', () => {
    test('delegates to repo.removeNonPendingOrActiveUserTasks', async () => {
        const {manager, repo} = make()
        await manager.removeUserTasks('alice')
        expect(repo.removeNonPendingOrActiveUserTasks).toHaveBeenCalledWith('alice')
    })
})

describe('failTasksInSession', () => {
    test('fails every pending/active task in the session', async () => {
        const tasks = [task({id: 't-1'}), task({id: 't-2'})]
        const repo = makeRepo({pendingOrActiveTasksInSession: () => tasks})
        const {manager} = make({repo})
        await manager.failTasksInSession({sessionId: 's-1', description: 'gone'})
        const failed = repo.update.mock.calls.map(c => c[0])
        expect(failed.every(t => t.state === State.FAILED)).toBe(true)
        expect(failed[0].statusDescription).toBe('gone')
    })

    test('null description falls back to the default FAILED description', async () => {
        const repo = makeRepo({pendingOrActiveTasksInSession: () => [task({id: 't-1'})]})
        const {manager} = make({repo})
        await manager.failTasksInSession({sessionId: 's-1'})
        expect(repo.update.mock.calls[0][0].statusDescription).toBe(StateDescription.FAILED)
    })
})

describe('userTasks / getTask', () => {
    test('userTasks returns repo.userTasks', async () => {
        const tasks = [task({id: 't-1'})]
        const repo = makeRepo({userTasks: () => tasks})
        const {manager} = make({repo})
        expect(await manager.userTasks('alice')).toBe(tasks)
    })

    test('getTask enforces ownership', async () => {
        const repo = makeRepo({getTask: () => task({username: 'alice'})})
        const {manager} = make({repo})
        expect((await manager.getTask({taskId: 't-1', username: 'alice'})).id).toBe('t-1')
        await expect(manager.getTask({taskId: 't-1', username: 'bob'})).rejects.toBeInstanceOf(Unauthorized)
    })
})

describe('session-event wiring', () => {
    test('WorkerSessionActivated → ExecuteTasksInSession (mapped session)', async () => {
        const tasks = [task({id: 't-1'})]
        const repo = makeRepo({pendingOrActiveTasksInSession: () => tasks})
        const {manager, workerGateway, sessionEvents} = make({repo})
        manager.start()
        // 4c payload: full worker session domain (has instance.host)
        sessionEvents.emit('WorkerSessionActivated', {
            username: 'alice',
            session: {id: 's-1', instanceType: 'T3aSmall', username: 'alice', state: State.ACTIVE, instance: {id: 'i-1', host: 'host-9'}},
        })
        await flush()
        expect(repo.pendingOrActiveTasksInSession).toHaveBeenCalledWith('s-1')
        expect(workerGateway.execute.mock.calls[0][1].host).toBe('host-9')
    })

    test('WorkerSessionClosed → FailTasksInSession', async () => {
        const tasks = [task({id: 't-1'})]
        const repo = makeRepo({pendingOrActiveTasksInSession: () => tasks})
        const {manager, sessionEvents} = make({repo})
        manager.start()
        sessionEvents.emit('WorkerSessionClosed', {username: 'alice', sessionId: 's-1'})
        await flush()
        expect(repo.pendingOrActiveTasksInSession).toHaveBeenCalledWith('s-1')
        expect(repo.update.mock.calls[0][0].state).toBe(State.FAILED)
    })

    test('stop() unregisters consumers', async () => {
        const repo = makeRepo({pendingOrActiveTasksInSession: () => [task()]})
        const {manager, sessionEvents} = make({repo})
        manager.start()
        manager.stop()
        sessionEvents.emit('WorkerSessionClosed', {sessionId: 's-1'})
        await flush()
        expect(repo.pendingOrActiveTasksInSession).not.toHaveBeenCalled()
    })

    test('consumers are not registered until start()', async () => {
        const repo = makeRepo({pendingOrActiveTasksInSession: () => [task()]})
        const {sessionEvents} = make({repo})
        sessionEvents.emit('WorkerSessionClosed', {sessionId: 's-1'})
        await flush()
        expect(repo.pendingOrActiveTasksInSession).not.toHaveBeenCalled()
    })
})
