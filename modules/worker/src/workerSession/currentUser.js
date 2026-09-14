// currentUser — gateway-injected `sepal-user` auth, mirroring the established Node pattern
// (modules/user/src/currentUser.js, modules/message/src/currentUser.js).
//
// The gateway authenticates the request and injects a JSON `sepal-user` header. We parse it into
// ctx.state.currentUser. requireAuth = any authenticated user; requireAdmin = the
// `application_admin` role.
//
// A request authenticated with a worker session's api key carries a second gateway-injected header,
// `sepal-session`, naming the session it was authenticated as. The gateway derives it from the key
// and strips whatever the client sent.

import {getLogger} from '#sepal/log'

import {TASK_EXECUTOR} from '../workerInstance/workerTypes.js'

const log = getLogger('currentUser')

const HEADER = 'sepal-user'
const SESSION_HEADER = 'sepal-session'
const ADMIN_ROLE = 'application_admin'

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

// Parse the gateway-injected sepal-session header, or null when missing/invalid.
export const parseWorkerSession = ctx => {
    const value = ctx.headers[SESSION_HEADER]
    if (!value) {
        return null
    }
    try {
        return JSON.parse(value)
    } catch (error) {
        log.warn(`Invalid ${SESSION_HEADER} header`, error.message)
        return null
    }
}

// Koa guard: require a request authenticated as a TASK_EXECUTOR worker session; sets
// ctx.state.currentUser and ctx.state.workerSession. 401 unauthenticated, 403 otherwise. The
// handler checks which executor it is against the task.
export const requireTaskExecutorSession = async (ctx, next) => {
    const user = parseCurrentUser(ctx)
    if (!user) {
        ctx.status = 401
        ctx.body = {message: `No "${HEADER}" header in request`}
        return
    }
    const workerSession = parseWorkerSession(ctx)
    if (workerSession?.workerType !== TASK_EXECUTOR || !workerSession.sessionId) {
        ctx.status = 403
        ctx.body = {message: 'Task executor session required'}
        return
    }
    ctx.state.currentUser = user
    ctx.state.workerSession = workerSession
    await next()
}

export {parseCurrentUser, requireAdmin, requireAuth}
