const {job} = require('#gee/jobs/job')
const {eeLimiterService} = require('#sepal/ee/eeLimiterService')

const DEFAULT_MAX_RETRIES = 3

/*
To use highvolume endpoint, configure initArgs in worker:

    module.exports = job({
        jobName: 'Some job name',
        jobPath: __filename,
        initArgs: () => ({eeEndpoint: 'https://earthengine-highvolume.googleapis.com'}),
        worker$
    })
*/

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
        serviceAccountCredentials,
        googleProjectId: config.googleProjectId
    }
}

const worker$ = ({sepalUser, serviceAccountCredentials, googleProjectId}, {initArgs: {eeEndpoint} = {}}) => {
    const {switchMap} = require('rxjs')
    const {swallow} = require('#sepal/rxjs')
    const ee = require('#sepal/ee')
    const log = require('#sepal/log').getLogger('auth')

    if (sepalUser) {
        ee.setUsername(sepalUser.username)
    }

    const secondsToExpiration = expiration => {
        const millisecondsLeft = expiration - Date.now()
        if (millisecondsLeft <= 0) {
            throw new Error('Token expired')
        }
        return millisecondsLeft / 1000
    }

    const authenticateServiceAccount$ = serviceAccountCredentials =>
        ee.$({
            description: 'authenticate service account',
            operation: (resolve, reject) => {
                ee.sepal.setAuthType('SERVICE_ACCOUNT')
                log.debug('Authenticating service account')
                ee.data.authenticateViaPrivateKey(serviceAccountCredentials, resolve, reject)
            }
        })

    const authenticateUserAccount$ = googleTokens =>
        ee.$({
            description: 'authenticate user account',
            operation: (resolve, reject) => {
                ee.sepal.setAuthType('USER')
                log.debug(`Authenticating user account (expiring in ${secondsToExpiration(googleTokens.accessTokenExpiryDate)} s)`)
                ee.data.setAuthToken(
                    null, // clientId - no need to specify as EE API doesn't refresh the token
                    'Bearer', // tokenType
                    googleTokens.accessToken,
                    // secondsToExpiration(googleTokens.accessTokenExpiryDate),
                    null, // expiresIn - by setting this to null, we prevent a setTimeout() call in EE API
                    null, // extraScopes - we have no extra scopes
                    error => error ? reject(error) : resolve(), // error callback
                    false // updateAuthLibrary - we don't want EE API to refresh the token
                )
            }
        })

    const authenticate$ = ({sepalUser: {googleTokens}, serviceAccountCredentials}) =>
        googleTokens
            ? authenticateUserAccount$(googleTokens)
            : authenticateServiceAccount$(serviceAccountCredentials)
            
    return authenticate$({sepalUser, serviceAccountCredentials}).pipe(
        switchMap(() => ee.$({
            description: 'initialize',
            operation: (resolve, reject) => {
                const projectId = sepalUser?.googleTokens?.projectId || googleProjectId
                ee.setMaxRetries(DEFAULT_MAX_RETRIES)
                // [HACK] Force ee to change projectId after first initialization (ee.initialize() doesn't do that).
                ee.data.initialize(eeEndpoint, null, null, projectId)
                ee.initialize(eeEndpoint, null, resolve, reject, null, projectId)
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
