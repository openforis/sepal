import {getTitle} from './task.js'

const STATUS_BY_ERROR = {Unauthorized: 403, InvalidCommand: 400, NotFound: 404}

export const taskAsListItem = task => ({
    id: task.id,
    recipeId: task.recipeId,
    name: getTitle(task),
    status: task.state,
    statusDescription: task.statusDescription,
    creationTime: task.creationTime,
    updateTime: task.updateTime,
    description: task.params?.description,
    taskInfo: task.params?.taskInfo
})

export const createTasksApi = tasks => {
    const username = ctx => ctx.state.currentUser.username
    const taskId = ctx => ctx.params.id
    const noContent = ctx => {
        ctx.status = 204
    }

    return {
        submit: ctx => run(ctx, async () => {
            const {operation, params, recipeId} = ctx.request.body ?? {}
            ctx.body = taskAsDetails(await tasks.submit({username: username(ctx), operation, params, recipeId}))
        }),
        getTask: ctx => run(ctx, async () => {
            ctx.body = await tasks.getTask({taskId: taskId(ctx), username: username(ctx)})
        }),
        getTaskDetails: ctx => run(ctx, async () => {
            ctx.body = taskAsDetails(await tasks.getTask({taskId: taskId(ctx), username: username(ctx)}))
        }),
        cancel: ctx => run(ctx, async () => {
            await tasks.cancel({taskId: taskId(ctx), username: username(ctx)})
            noContent(ctx)
        }),
        remove: ctx => run(ctx, async () => {
            await tasks.remove({taskId: taskId(ctx), username: username(ctx)})
            noContent(ctx)
        }),
        resubmit: ctx => run(ctx, async () => {
            await tasks.resubmit({taskId: taskId(ctx), username: username(ctx)})
            noContent(ctx)
        }),
        removeFinished: ctx => run(ctx, async () => {
            await tasks.removeFinished(username(ctx))
            noContent(ctx)
        }),
        progress: ctx => run(ctx, async () => {
            const {statusDescription} = ctx.request.body ?? {}
            await tasks.reportProgress({taskId: taskId(ctx), callerTaskId: ctx.state.taskSession.taskId, statusDescription})
            noContent(ctx)
        }),
        authenticateApiKey: ctx => run(ctx, async () => {
            const caller = await tasks.authenticateApiKey(ctx.request.body?.apiKey)
            ctx.status = caller ? 200 : 401
            ctx.body = caller ?? {}
        })
    }
}

const taskAsDetails = task => ({
    id: task.id,
    recipeId: task.recipeId,
    name: getTitle(task),
    status: task.state,
    statusDescription: task.statusDescription,
    creationTime: task.creationTime,
    updateTime: task.updateTime,
    params: task.params
})

const run = async (ctx, body) => {
    try {
        await body()
    } catch (error) {
        const status = STATUS_BY_ERROR[error?.name]
        if (!status) {
            throw error
        }
        ctx.status = status
        ctx.body = {message: error.message}
    }
}
