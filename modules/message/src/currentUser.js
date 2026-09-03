import {getLogger} from '#sepal/log'

const log = getLogger('currentUser')

const HEADER = 'sepal-user'
const ADMIN_ROLE = 'application_admin'

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

const isAdmin = user =>
    ((user && user.roles) || []).includes(ADMIN_ROLE)

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

const requireAdmin = async (ctx, next) => {
    const user = parseCurrentUser(ctx)
    if (!user) {
        ctx.status = 401
        ctx.body = {message: `No "${HEADER}" header in request`}
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

export {isAdmin, parseCurrentUser, requireAdmin, requireAuth}
