// tasksApi — HTTP handlers for the /tasks routes.
//
// Each handler resolves the currentUser (from ctx.state.currentUser, set by the auth guard) and
// the path task id, then calls the taskManager command/query surface.
//
// Error mapping — the command/query handlers throw typed errors; we translate to HTTP:
//   Unauthorized   → 403 (ownership violation)
//   InvalidCommand → 400
//   budget errors (InstanceBudgetExceeded / StorageBudgetExceeded / StorageQuotaExceeded thrown
//     from SubmitTask's session request) → 403, not a 500.
// Anything else propagates → the shared httpServer maps it to 500.

import {getTitle, State} from './task.js'

// Budget error names surfaced from a rejected session request (see
// ../workerSession/budgetErrors.js). Kept as a name set so we don't import the budget module
// across the task/session boundary.
const BUDGET_ERROR_NAMES = new Set([
    'InstanceBudgetExceeded',
    'StorageBudgetExceeded',
    'StorageQuotaExceeded',
])

// mapError — translate a typed handler error to an HTTP {status, message}, or null to re-throw.
const mapError = error => {
    if (error?.name === 'Unauthorized') {
        return {status: 403, message: error.message}
    }
    if (error?.name === 'InvalidCommand') {
        return {status: 400, message: error.message}
    }
    if (BUDGET_ERROR_NAMES.has(error?.name)) {
        return {status: 403, message: error.message}
    }
    return null
}

// run — invoke a handler body, translating typed errors to 4xx and re-throwing the rest.
const run = async (ctx, body) => {
    try {
        await body()
    } catch (error) {
        const mapped = mapError(error)
        if (!mapped) {
            throw error
        }
        ctx.status = mapped.status
        ctx.body = {message: mapped.message}
    }
}

// taskAsListItem — the task shape the websocket listing pushes (ws.js).
const taskAsListItem = task => ({
    id: task.id,
    recipeId: task.recipeId,
    name: getTitle(task),
    status: task.state,
    statusDescription: task.statusDescription,
    creationTime: task.creationTime,
    updateTime: task.updateTime,
    description: task.params?.description,
    taskInfo: task.params?.taskInfo,
})

// taskAsDetails — the GET /tasks/task/{id}/details projection.
const taskAsDetails = task => ({
    id: task.id,
    recipeId: task.recipeId,
    name: getTitle(task),
    status: task.state,
    statusDescription: task.statusDescription,
    creationTime: task.creationTime,
    updateTime: task.updateTime,
    params: task.params,
})

const createTasksApi = ({taskManager}) => {
    const username = ctx => ctx.state.currentUser.username
    const taskId = ctx => ctx.params.id

    // POST /tasks — submit a task. Session-request rejection (budget etc.) → 4xx via mapError.
    const submitTask = ctx => run(ctx, async () => {
        const {recipeId, instanceType, operation, params} = ctx.request.body ?? {}
        ctx.body = await taskManager.submitTask({
            recipeId,
            instanceType,
            operation,
            params,
            username: username(ctx),
        })
    })

    // GET /tasks/task/{id} — the raw task (ownership enforced by the handler).
    const getTask = ctx => run(ctx, async () => {
        ctx.body = await taskManager.getTask({taskId: taskId(ctx), username: username(ctx)})
    })

    // GET /tasks/task/{id}/details — the details projection.
    const getTaskDetails = ctx => run(ctx, async () => {
        const task = await taskManager.getTask({taskId: taskId(ctx), username: username(ctx)})
        ctx.body = taskAsDetails(task)
    })

    // POST /tasks/task/{id}/cancel — 204.
    const cancelTask = ctx => run(ctx, async () => {
        await taskManager.cancelTask({taskId: taskId(ctx), username: username(ctx)})
        ctx.status = 204
    })

    // POST /tasks/task/{id}/remove — 204.
    const removeTask = ctx => run(ctx, async () => {
        await taskManager.removeTask({taskId: taskId(ctx), username: username(ctx)})
        ctx.status = 204
    })

    // POST /tasks/task/{id}/execute — resubmit, 204.
    const executeTask = ctx => run(ctx, async () => {
        await taskManager.resubmitTask({taskId: taskId(ctx), username: username(ctx)})
        ctx.status = 204
    })

    // POST /tasks/remove — remove all of the user's tasks, 204.
    const removeUserTasks = ctx => run(ctx, async () => {
        await taskManager.removeUserTasks(username(ctx))
        ctx.status = 204
    })

    // POST /tasks/task/{id}/state-updated (admin/task_executor) — state + statusDescription, 204.
    // The task module sends them as a form-urlencoded BODY (task/src/taskManager.js), so accept
    // them from either the query string or the body.
    const stateUpdated = ctx => run(ctx, async () => {
        const state = ctx.query.state ?? ctx.request.body?.state
        const statusDescription = ctx.query.statusDescription ?? ctx.request.body?.statusDescription
        if (!state) {
            ctx.status = 400
            ctx.body = {message: 'state required'}
            return
        }
        if (statusDescription == null) {
            ctx.status = 400
            ctx.body = {message: 'statusDescription required'}
            return
        }
        await taskManager.updateTaskProgress({
            taskId: taskId(ctx),
            state,
            statusDescription,
            username: username(ctx),
        })
        ctx.status = 204
    })

    // POST /tasks/active (admin/task_executor) — QS `progress` is a JSON STRING {taskId: {...}},
    // NOT a JSON body. One UpdateTaskProgress per entry, with state ACTIVE and statusDescription
    // the JSON of the entry's description.
    const active = ctx => run(ctx, async () => {
        const progressRaw = ctx.query.progress
        if (progressRaw == null) {
            ctx.status = 400
            ctx.body = {message: 'progress required'}
            return
        }
        let progress
        try {
            progress = JSON.parse(progressRaw)
        } catch (_error) {
            ctx.status = 400
            ctx.body = {message: 'progress must be a JSON string'}
            return
        }
        for (const [id, description] of Object.entries(progress)) {
            await taskManager.updateTaskProgress({
                taskId: id,
                state: State.ACTIVE,
                statusDescription: JSON.stringify(description),
                username: username(ctx),
            })
        }
        ctx.status = 204
    })

    return {
        submitTask,
        getTask,
        getTaskDetails,
        cancelTask,
        removeTask,
        executeTask,
        removeUserTasks,
        stateUpdated,
        active,
        _internal: {taskAsListItem, taskAsDetails, mapError},
    }
}

export {createTasksApi, taskAsListItem}
