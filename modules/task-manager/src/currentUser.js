import {getLogger} from '#sepal/log'

const log = getLogger('currentUser')

const HEADER = 'sepal-user'
const SESSION_HEADER = 'sepal-session'
const ADMIN_ROLE = 'application_admin'

export const isAdmin = user =>
    ((user && user.roles) || []).includes(ADMIN_ROLE)

export const parseCurrentUser = ctx => parseHeader(ctx, HEADER)

export const requireAuth = async (ctx, next) => {
    const user = parseCurrentUser(ctx)
    if (!user) {
        refuseUnauthenticated(ctx)
        return
    }
    ctx.state.currentUser = user
    await next()
}

export const requireAdmin = async (ctx, next) => {
    const user = parseCurrentUser(ctx)
    if (!user) {
        refuseUnauthenticated(ctx)
        return
    }
    if (!isAdmin(user)) {
        ctx.status = 403
        ctx.body = {message: 'Admin role required'}
        return
    }
    ctx.state.currentUser = user
    await next()
}

// The gateway sets sepal-session from the key a request was authenticated with; a task container's key names
// its task.
export const requireTaskSession = async (ctx, next) => {
    const user = parseCurrentUser(ctx)
    if (!user) {
        refuseUnauthenticated(ctx)
        return
    }
    const session = parseHeader(ctx, SESSION_HEADER)
    if (session?.workerType !== 'task' || !session.taskId) {
        ctx.status = 403
        ctx.body = {message: 'Task session required'}
        return
    }
    ctx.state.currentUser = user
    ctx.state.taskSession = session
    await next()
}

const refuseUnauthenticated = ctx => {
    ctx.status = 401
    ctx.body = {message: `No "${HEADER}" header in request`}
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
