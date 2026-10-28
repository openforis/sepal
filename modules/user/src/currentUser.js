import {getLogger} from '#sepal/log'

const log = getLogger('currentUser')

const HEADER = 'sepal-user'
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

// Koa guard: require the application_admin role. 401/403 otherwise.
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

export {parseCurrentUser, requireAdmin, requireAuth}
