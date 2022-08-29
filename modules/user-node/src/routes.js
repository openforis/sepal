const {stream} = require('sepal/httpServer')
const ws$ = require('./ws')
const {homeDir} = require('./config')
const {Authenticate} = require('./authenticate')

const authenticate = async (ctx, next) => {
    try {
        const {username, password} = ctx.request.body
        const user = await Authenticate({username, password})
        if (user) {
            log.info(`Authentication succeeded: ${username}`)
            await RefreshGoogleAccessToken({
                username: user.username,
                tokens: user.googleTokens
            })
            ctx.response.status = 200
            ctx.response.body = user
        } else {
            log.info(`Authentication failed: ${username}`)
            ctx.response.status = 401
        }
    } catch (error) {
        ctx.response.status = 500
        ctx.response.body = error
    }
}

const passwordResetRequest = async (ctx, next) => {
    try {
        const {email} = ctx.request.body
        await submit(new RequestPasswordReset(email))
        ctx.response.status = 200
        ctx.response.body = {
            status : 'success',
            message: 'If there is an account with this email, an email with a password reset link will be sent there'
        }
    } catch (error) {
        ctx.response.status = 500
        ctx.response.body = error
    }
}

const validateToken = async (ctx, next) => {
    try {
        const {token} = ctx.request.body
        const tokenStatus = await submit(new ValidateToken(token))
        if (tokenStatus?.valid) {
            ctx.response.status = 200
            ctx.response.body = {
                status: 'success', 
                token: tokenStatus.token, 
                user: tokenStatus.user, 
                message: 'Token is valid'
            }
        } else {
            const reason = tokenStatus?.expired ? 'expired' : 'invalid'
            ctx.response.status = 200
            ctx.response.body = {
                status: 'failure', 
                token: tokenStatus?.token, 
                reason: reason, 
                message: `Token is ${reason}`
            }
        }
    } catch (error) {
        ctx.response.status = 500
        ctx.response.body = error
    }
}

const passwordReset = async (ctx, next) => {
    try {
        const {token, password} = ctx.request.body
        const user = await submit(new ResetPassword(token, password))
        ctx.response.status = 200
        ctx.response.body = user
    } catch (error) {
        ctx.response.status = 500
        ctx.response.body = error
    }
}

// const activate = async (ctx, next) => {
//     try {
//         const {token, password} = ctx.request.body
//         const user = await submit(new ActivateUser(token, password))
//         ctx.response.status = 200
//         ctx.response.body = user
//     } catch (error) {
//         ctx.response.status = 500
//         ctx.response.body = error
//     }
// }

const accessRequestCallback = async (ctx, next) => {
    const query = ctx.request.query
    ctx.redirect(`/api/user/google/associate-account?${query}`)
}

module.exports = router =>
    router
         // NO_AUTH
        .post('/authenticate', authenticate)
        .post('/password/reset-request', passwordResetRequest)
        .post('/validate-token', validateToken)
        .post('/password/reset', passwordReset)
        // .post('/activate', activate)
        .get('/google/access-request-callback', accessRequestCallback)

        // USER
        .post('/login')
        .get('/current')
        .post('/current/password')
        .post('/current/details')
        .get('/google/access-request-url')
        .get('/google/associate-account')
        .post('/google/revoke-access')
        .post('/google/refresh-access-token')

        // ADMIN
        .post('/details')
        .get('/list')
        .get('/email-notifications-enabled/{email}')
        .post('/invite')
        .post('/delete')
