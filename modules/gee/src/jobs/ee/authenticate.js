const {job} = require('#gee/jobs/job')

const getSepalUser = ctx => {
    const sepalUser = ctx.request.headers['sepal-user']
    return sepalUser
        ? JSON.parse(sepalUser)
        : {}
}

const getCredentials = ctx => {
    const config = require('#gee/config')
    const sepalUser = getSepalUser(ctx)
    const serviceAccountCredentials = config.serviceAccountCredentials
    return {
        sepalUser,
        serviceAccountCredentials
    }
}

const worker$ = ({sepalUser, serviceAccountCredentials}) => {
    const {swallow} = require('#sepal/rxjs')
    const ee = require('#sepal/ee')

    if (sepalUser) {
        ee.setUsername(sepalUser.username)
    }

    const secondsToExpiration = expiration => {
        const millisecondsLeft = expiration - Date.now()
        if (millisecondsLeft < 0) {
            throw new Error('Token expired')
        }
        return millisecondsLeft / 1000
    }

    const authenticateServiceAccount$ = serviceAccountCredentials =>
        ee.$({
            operation: 'authenticate service account',
            ee: (resolve, reject) => {
                ee.sepal.setAuthType('SERVICE_ACCOUNT')
                ee.data.authenticateViaPrivateKey(serviceAccountCredentials, resolve, reject)
            }
        })

    const authenticateUserAccount$ = googleTokens =>
        ee.$({
            operation: 'authenticate user account',
            ee: (resolve, reject) => {
                ee.sepal.setAuthType('USER')
                ee.data.setAuthToken(
                    null,
                    'Bearer',
                    googleTokens.accessToken,
                    secondsToExpiration(googleTokens.accessTokenExpiryDate),
                    null,
                    error => error ? reject(error) : resolve(),
                    false
                )
            }
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
    before: [require('#gee/jobs/configure')],
    args: ctx => [getCredentials(ctx)],
    worker$
})
