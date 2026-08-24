// tasksApi tests — verify each handler invokes the correct taskManager handler with the correct
// args (currentUser vs path id), serialises the response, sets the correct status codes, parses
// the /active QS-JSON-string, and maps typed errors (ownership, invalid, budget) to 4xx instead
// of 500.

import {jest} from '@jest/globals'

import {InvalidCommand, Unauthorized} from './errors.js'
import {State} from './task.js'
import {createTasksApi} from './tasksApi.js'

const makeManager = () => ({
    submitTask: jest.fn(),
    getTask: jest.fn(),
    cancelTask: jest.fn(),
    removeTask: jest.fn(),
    resubmitTask: jest.fn(),
    removeUserTasks: jest.fn(),
    updateTaskProgress: jest.fn(),
})

const ctx = ({username = 'u', params = {}, query = {}, body = {}} = {}) => ({
    state: {currentUser: {username}},
    params,
    query,
    request: {body},
})

const sampleTask = () => ({
    id: 't1',
    recipeId: 'r1',
    state: State.PENDING,
    username: 'u',
    sessionId: 's1',
    operation: 'some-operation',
    params: {title: 'My Task', description: 'desc', taskInfo: {outputPath: '/out', destination: 'D'}},
    statusDescription: '{"defaultMessage":"Initializing..."}',
    creationTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-02T00:00:00Z'),
})

let manager
let api
beforeEach(() => {
    manager = makeManager()
    api = createTasksApi({taskManager: manager})
})

// ── POST /tasks — submit + rejection → 4xx ─────────────────────────────────────

test('submitTask forwards the body + username and returns the raw task', async () => {
    const submitted = sampleTask()
    manager.submitTask.mockResolvedValue(submitted)
    const c = ctx({body: {recipeId: 'r1', instanceType: 'm5', operation: 'op', params: {a: 1}}})
    await api.submitTask(c)
    expect(manager.submitTask).toHaveBeenCalledWith({
        recipeId: 'r1',
        instanceType: 'm5',
        operation: 'op',
        params: {a: 1},
        username: 'u',
    })
    expect(c.body).toBe(submitted)
})

test('submitTask maps a budget session-rejection to 403 (not 500)', async () => {
    const budgetError = new Error('Instance budget exceeded')
    budgetError.name = 'InstanceBudgetExceeded'
    manager.submitTask.mockRejectedValue(budgetError)
    const c = ctx({body: {operation: 'op'}})
    await api.submitTask(c)
    expect(c.status).toBe(403)
    expect(c.body).toEqual({message: 'Instance budget exceeded'})
})

test('submitTask re-throws a non-typed error (→ 500 via httpServer)', async () => {
    manager.submitTask.mockRejectedValue(new Error('boom'))
    const c = ctx({body: {operation: 'op'}})
    await expect(api.submitTask(c)).rejects.toThrow('boom')
})

// ── GET /tasks/task/{id} + details — ownership ─────────────────────────────────

test('getTask calls getTask with the path id + username and returns the raw task', async () => {
    const task = sampleTask()
    manager.getTask.mockResolvedValue(task)
    const c = ctx({params: {id: 't1'}})
    await api.getTask(c)
    expect(manager.getTask).toHaveBeenCalledWith({taskId: 't1', username: 'u'})
    expect(c.body).toBe(task)
})

test('getTask maps an ownership violation (Unauthorized) to 403', async () => {
    manager.getTask.mockRejectedValue(new Unauthorized('Task not owned by user: t1'))
    const c = ctx({params: {id: 't1'}})
    await api.getTask(c)
    expect(c.status).toBe(403)
    expect(c.body).toEqual({message: 'Task not owned by user: t1'})
})

test('getTaskDetails serialises the details projection', async () => {
    manager.getTask.mockResolvedValue(sampleTask())
    const c = ctx({params: {id: 't1'}})
    await api.getTaskDetails(c)
    expect(manager.getTask).toHaveBeenCalledWith({taskId: 't1', username: 'u'})
    expect(c.body).toEqual({
        id: 't1',
        recipeId: 'r1',
        name: 'My Task',
        status: State.PENDING,
        statusDescription: '{"defaultMessage":"Initializing..."}',
        creationTime: sampleTask().creationTime,
        updateTime: sampleTask().updateTime,
        params: sampleTask().params,
    })
})

// ── cancel / remove / execute / remove-all — 204 + args ────────────────────────

test('cancelTask calls cancelTask and sets 204', async () => {
    manager.cancelTask.mockResolvedValue(null)
    const c = ctx({params: {id: 't1'}})
    await api.cancelTask(c)
    expect(manager.cancelTask).toHaveBeenCalledWith({taskId: 't1', username: 'u'})
    expect(c.status).toBe(204)
})

test('removeTask calls removeTask and sets 204', async () => {
    manager.removeTask.mockResolvedValue(null)
    const c = ctx({params: {id: 't1'}})
    await api.removeTask(c)
    expect(manager.removeTask).toHaveBeenCalledWith({taskId: 't1', username: 'u'})
    expect(c.status).toBe(204)
})

test('removeTask maps InvalidCommand to 400', async () => {
    manager.removeTask.mockRejectedValue(new InvalidCommand('Only terminal tasks can be removed'))
    const c = ctx({params: {id: 't1'}})
    await api.removeTask(c)
    expect(c.status).toBe(400)
    expect(c.body).toEqual({message: 'Only terminal tasks can be removed'})
})

test('executeTask calls resubmitTask and sets 204', async () => {
    manager.resubmitTask.mockResolvedValue(sampleTask())
    const c = ctx({params: {id: 't1'}})
    await api.executeTask(c)
    expect(manager.resubmitTask).toHaveBeenCalledWith({taskId: 't1', username: 'u'})
    expect(c.status).toBe(204)
})

test('removeUserTasks calls removeUserTasks with the username and sets 204', async () => {
    manager.removeUserTasks.mockResolvedValue(null)
    const c = ctx()
    await api.removeUserTasks(c)
    expect(manager.removeUserTasks).toHaveBeenCalledWith('u')
    expect(c.status).toBe(204)
})

// ── state-updated (executor) ───────────────────────────────────────────────────

test('stateUpdated calls updateTaskProgress with QS state + statusDescription, 204', async () => {
    manager.updateTaskProgress.mockResolvedValue(sampleTask())
    const c = ctx({params: {id: 't1'}, query: {state: 'ACTIVE', statusDescription: '{"x":1}'}})
    await api.stateUpdated(c)
    expect(manager.updateTaskProgress).toHaveBeenCalledWith({
        taskId: 't1',
        state: 'ACTIVE',
        statusDescription: '{"x":1}',
        username: 'u',
    })
    expect(c.status).toBe(204)
})

test('stateUpdated returns 400 when state is missing', async () => {
    const c = ctx({params: {id: 't1'}, query: {statusDescription: '{}'}})
    await api.stateUpdated(c)
    expect(c.status).toBe(400)
    expect(manager.updateTaskProgress).not.toHaveBeenCalled()
})

// The task module POSTs state + statusDescription as a form-urlencoded BODY
// (task/src/taskManager.js taskStateChanged$), so both spellings must work.
test('stateUpdated accepts form-body state + statusDescription (task-module parity), 204', async () => {
    manager.updateTaskProgress.mockResolvedValue(sampleTask())
    const c = ctx({params: {id: 't1'}, body: {state: 'COMPLETED', statusDescription: '{"defaultMessage":"Completed!"}'}})
    await api.stateUpdated(c)
    expect(manager.updateTaskProgress).toHaveBeenCalledWith({
        taskId: 't1',
        state: 'COMPLETED',
        statusDescription: '{"defaultMessage":"Completed!"}',
        username: 'u',
    })
    expect(c.status).toBe(204)
})

// ── active (executor) — QS JSON-string parsing ─────────────────────────────────

test('active parses the progress QS JSON-string and calls updateTaskProgress per entry (ACTIVE)', async () => {
    manager.updateTaskProgress.mockResolvedValue(sampleTask())
    const progress = {
        taskA: {defaultMessage: 'A'},
        taskB: {defaultMessage: 'B'},
    }
    const c = ctx({query: {progress: JSON.stringify(progress)}})
    await api.active(c)
    expect(manager.updateTaskProgress).toHaveBeenCalledTimes(2)
    expect(manager.updateTaskProgress).toHaveBeenNthCalledWith(1, {
        taskId: 'taskA',
        state: State.ACTIVE,
        statusDescription: JSON.stringify({defaultMessage: 'A'}),
        username: 'u',
    })
    expect(manager.updateTaskProgress).toHaveBeenNthCalledWith(2, {
        taskId: 'taskB',
        state: State.ACTIVE,
        statusDescription: JSON.stringify({defaultMessage: 'B'}),
        username: 'u',
    })
    expect(c.status).toBe(204)
})

test('active returns 400 when progress is missing', async () => {
    const c = ctx()
    await api.active(c)
    expect(c.status).toBe(400)
    expect(manager.updateTaskProgress).not.toHaveBeenCalled()
})

test('active returns 400 when progress is not valid JSON', async () => {
    const c = ctx({query: {progress: 'not-json'}})
    await api.active(c)
    expect(c.status).toBe(400)
    expect(manager.updateTaskProgress).not.toHaveBeenCalled()
})
