const job = require('root/jobs/job')

const getSepalUser = ctx => {
    const sepalUser = ctx.request.headers['sepal-user']
    return sepalUser
        ? JSON.parse(sepalUser)
        : {}
}

const getCredentials = ctx => {
    const config = require('../../config')
    const sepalUser = getSepalUser(ctx)
    const serviceAccountCredentials = config.serviceAccountCredentials
    return {
        sepalUser,
        serviceAccountCredentials
    }
}

const worker$ = ({sepalUser, serviceAccountCredentials}) => {
    const {swallow} = require('sepal/rxjs/operators')
    const ee = require('ee')

    const secondsToExpiration = expiration => {
        const millisecondsLeft = expiration - Date.now()
        if (millisecondsLeft < 0) {
            throw new Error('Token expired')
        }
        return millisecondsLeft / 1000
    }

    const authenticateServiceAccount$ = credentials =>
        ee.$({
            operation: 'autenticate service account',
            ee: (resolve, reject) => ee.data.authenticateViaPrivateKey(credentials, resolve, reject)
        })

    const authenticateUserAccount$ = googleTokens =>
        ee.$({
            operation: 'authenticate user account',
            ee: resolve =>
                ee.data.setAuthToken(
                    null,
                    'Bearer',
                    googleTokens.accessToken,
                    secondsToExpiration(googleTokens.accessTokenExpiryDate),
                    null,
                    resolve,
                    false
                )
        })

    const authenticate$ = ({sepalUser: {googleTokens}, serviceAccountCredentials}) =>
        googleTokens
            ? authenticateUserAccount$(googleTokens)
            : authenticateServiceAccount$(serviceAccountCredentials)

    return authenticate$({sepalUser, serviceAccountCredentials}).pipe(
        swallow()
    )
}

module.exports = job({
    jobName: 'EE Authentication',
    worker$,
    args: ctx => [getCredentials(ctx)]
})
