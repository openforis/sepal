import {getLogger} from '#sepal/log'

const log = getLogger('http')

const HEADER = 'sepal-user'

export const requireAuth = async (ctx, next) => {
    const user = parseCurrentUser(ctx)
    if (!user?.username) {
        ctx.status = 401
        ctx.body = {message: `No user in "${HEADER}" header`}
        return
    }
    ctx.state.currentUser = user
    await next()
}

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
