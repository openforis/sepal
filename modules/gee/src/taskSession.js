import {getLogger} from '#sepal/log'

const log = getLogger('taskSession')

const SESSION_HEADER = 'sepal-session'

// The gateway sets sepal-session from the key a request was authenticated with, and drops one the caller sent.
// Only a task container's key names a task, so a user calling a task endpoint directly cannot run an export
// outside task-manager's task limits, or outside the task tiers of the Earth Engine limiter.
export const requireTaskSession = async (ctx, next) => {
    const session = parseHeader(ctx, SESSION_HEADER)
    if (session?.workerType !== 'task' || !session.taskId) {
        ctx.status = 403
        ctx.body = {message: 'Task session required'}
        return
    }
    await next()
}

const parseHeader = (ctx, name) => {
    const value = ctx.headers[name]
    if (!value) {
        return null
    }
    try {
        return JSON.parse(value)
    } catch (error) {
        log.warn(`Invalid ${name} header`, error.message)
        return null
    }
}
