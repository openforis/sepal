const {job} = require('#gee/jobs/job')
const {eeLimiterService} = require('#sepal/ee/eeLimiterService')

const DEFAULT_MAX_RETRIES = 3

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
    const {switchMap} = require('rxjs')
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
        switchMap(() => ee.$({
            operation: 'initialize',
            ee: (resolve, reject) => {
                ee.setMaxRetries(DEFAULT_MAX_RETRIES)
                ee.initialize(null, null, resolve, reject, null, sepalUser?.googleTokens?.projectId)
            }
        })),
        swallow()
    )
}

module.exports = job({
    jobName: 'EE Authentication',
    before: [require('#gee/jobs/configure')],
    args: ctx => [getCredentials(ctx)],
    services: [eeLimiterService],
    worker$
})
