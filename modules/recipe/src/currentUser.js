const HEADER = 'sepal-user'

const createRequireAuth = ({log}) => {

    const requireAuth = async (ctx, next) => {
        const user = currentUser(ctx)
        if (user) {
            ctx.state.currentUser = user
            await next()
        } else {
            ctx.status = 401
            ctx.body = {message: `No "${HEADER}" header in request`}
        }
    }

    const currentUser = ctx => {
        const value = ctx.headers[HEADER]
        if (!value) {
            return null
        }
        try {
            return JSON.parse(value)
        } catch (error) {
            // The gateway authenticates before this service is reached, so a header that will not parse
            // is its bug rather than a client's, and the 401 alone would not say so.
            log.warn(`Invalid ${HEADER} header`, error.message)
            return null
        }
    }

    return requireAuth
}

export {createRequireAuth}
