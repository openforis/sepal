const {job} = require('#gee/jobs/job')
const {eeLimiterService} = require('#sepal/ee/eeLimiterService')
const {tag} = require('sepal/src/tag')

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

const userTag = username => tag('User', username || 'ANON')

const worker$ = ({
    credentials: {sepalUser, serviceAccountCredentials, googleProjectId},
    initArgs: {eeEndpoint} = {}
}) => {
    const {switchMap, of} = require('rxjs')
    const {swallow} = require('#sepal/rxjs')
    const ee = require('#sepal/ee/ee')
    const log = require('#sepal/log').getLogger('auth')

    if (sepalUser) {
        ee.setUsername(sepalUser.username)
    } else {
        log.warn('Missing sepalUser')
        ee.setUsername(null)
    }

    const calculateSecondsToExpiration = expiration => {
        const millisecondsLeft = expiration - Date.now()
        return millisecondsLeft / 1000
    }

    const authenticateServiceAccount$ = (serviceAccountCredentials, username) => {
        log.debug(userTag(username), 'Authenticating service account')
        ee.sepal.setAuthType('SERVICE_ACCOUNT')
        return ee.$({
            description: 'authenticate service account',
            operation: (resolve, reject) => {
                ee.data.authenticateViaPrivateKey(serviceAccountCredentials, resolve, reject)
            }
        })
    }

    const validateGoogleTokens = (googleTokens, username) => {
        if (!googleTokens.accessToken) {
            throw Error(`${userTag(username)} Access token is missing`)
        }
        const secondsToExpiration = calculateSecondsToExpiration(googleTokens.accessTokenExpiryDate)
        if (secondsToExpiration <= 0) {
            throw Error(`${userTag(username)} Token expired ${secondsToExpiration} seconds ago`)
        }
    }

    const authenticateUserAccount$ = (googleTokens, username) => {
        validateGoogleTokens(googleTokens, username)
        ee.sepal.setAuthType('USER')
        const secondsToExpiration = calculateSecondsToExpiration(googleTokens.accessTokenExpiryDate)
        log.debug(userTag(username), `Authenticating user account (expiring in ${secondsToExpiration} s)`)
        
        // Make sure refresh of previously authenticated service account is prevented
        ee.data.clearAuthToken()
        ee.data.setAuthTokenRefresher(null)

        ee.data.setAuthToken(
            null, // clientId - no need to specify as EE API doesn't refresh the token
            'Bearer', // tokenType
            googleTokens.accessToken,
            null, // expiresIn - by setting this to null, we prevent a setTimeout() call in EE API
            null, // extraScopes - we have no extra scopes
            null, // error callback
            false // updateAuthLibrary - we don't want EE API to refresh the token
        )
        return of(true)
    }

    const authenticate$ = ({sepalUser: {googleTokens, username}, serviceAccountCredentials}) =>
        googleTokens
            ? authenticateUserAccount$(googleTokens, username)
            : authenticateServiceAccount$(serviceAccountCredentials, username)
            
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
    services: [eeLimiterService],
    worker$
})
