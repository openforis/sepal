// currentUser — gateway-injected `sepal-user` auth, mirroring the established Node pattern
// (modules/user/src/currentUser.js, modules/message/src/currentUser.js).
//
// The gateway authenticates the request and injects a JSON `sepal-user` header. We parse it into
// ctx.state.currentUser. requireAuth = any authenticated user; requireAdmin = the
// `application_admin` role.

import {getLogger} from '#sepal/log'

const log = getLogger('currentUser')

const HEADER = 'sepal-user'
const ADMIN_ROLE = 'application_admin'
const TASK_EXECUTOR_ROLE = 'task_executor'

// Parse the gateway-injected sepal-user header into a user object, or null when missing/invalid.
const parseCurrentUser = ctx => {
    const value = ctx.headers[HEADER]
    if (!value) {
        return null
    }
    try {
        return JSON.parse(value)
    } catch (error) {
        log.warn(`Invalid ${HEADER} header`, error.message)
        return null
    }
}

// Koa guard: require an authenticated user; sets ctx.state.currentUser. 401 otherwise.
const requireAuth = async (ctx, next) => {
    const user = parseCurrentUser(ctx)
    if (!user) {
        ctx.status = 401
        ctx.body = {message: `No "${HEADER}" header in request`}
        return
    }
    ctx.state.currentUser = user
    await next()
}

// Koa guard: require the application_admin role. 401 if unauthenticated, 403 if not admin.
const requireAdmin = async (ctx, next) => {
    const user = parseCurrentUser(ctx)
    if (!user) {
        ctx.status = 401
        ctx.body = {message: `No "${HEADER}" header in request`}
        return
    }
    if (!(user.roles || []).includes(ADMIN_ROLE)) {
        ctx.status = 403
        ctx.body = {message: 'Admin role required'}
        return
    }
    ctx.state.currentUser = user
    await next()
}

// Koa guard: require the application_admin OR task_executor role. 401 if unauthenticated, 403
// if the user holds neither role. The gateway resolves the executor's Basic auth into the
// sepal-user header carrying the task_executor role, so the worker only checks the header role
// here.
const requireAdminOrTaskExecutor = async (ctx, next) => {
    const user = parseCurrentUser(ctx)
    if (!user) {
        ctx.status = 401
        ctx.body = {message: `No "${HEADER}" header in request`}
        return
    }
    const roles = user.roles || []
    if (!(roles.includes(ADMIN_ROLE) || roles.includes(TASK_EXECUTOR_ROLE))) {
        ctx.status = 403
        ctx.body = {message: 'Admin or task_executor role required'}
        return
    }
    ctx.state.currentUser = user
    await next()
}

export {parseCurrentUser, requireAdmin, requireAdminOrTaskExecutor, requireAuth}
