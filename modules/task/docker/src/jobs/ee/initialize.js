const {job} = require('root/jobs/job')
const {limiter} = require('sepal/ee/eeLimiter')

const worker$ = () => {
    const {ReplaySubject} = require('rx')
    const {switchMap} = require('rx/operators')
    const ee = require('ee')
    const {getContext$} = require('root/jobs/service/context')
    
    const DEFAULT_MAX_RETRIES = 10

    const secondsToExpiration = expiration => {
        const millisecondsLeft = expiration - Date.now()
        if (millisecondsLeft < 0) {
            throw new Error('Token expired')
        }
        return millisecondsLeft / 1000
    }

    const authenticateServiceAccount$ = serviceAccountCredentials =>
        ee.$({
            operation: 'autenticate service account',
            ee: (resolve, reject) => {
                ee.sepal.setAuthType('SERVICE_ACCOUNT')
                ee.data.authenticateViaPrivateKey(serviceAccountCredentials, resolve, reject)
            }
        })

    const authenticateUserAccount$ = userCredentials =>
        ee.$({
            operation: 'authenticate user account',
            ee: (resolve, reject) => {
                ee.sepal.setAuthType('USER')
                ee.data.setAuthToken(
                    null,
                    'Bearer',
                    userCredentials['access_token'],
                    secondsToExpiration(userCredentials['access_token_expiry_date']),
                    // userCredentials.accessToken,
                    // secondsToExpiration(userCredentials.accessTokenExpiryDate),
                    null,
                    error => error ? reject(error) : resolve(),
                    false
                )
            }
        })

    const authenticate$ = context =>
        context.isUserAccount
            ? authenticateUserAccount$(context.userCredentials)
            : authenticateServiceAccount$(context.serviceAccountCredentials)

    const initialize$ = () =>
        ee.$({
            operation: 'initialize',
            ee: (resolve, reject) => {
                ee.setMaxRetries(DEFAULT_MAX_RETRIES)
                ee.initialize(null, null, resolve, reject)
            }
        })

    const ready$ = new ReplaySubject()

    getContext$().pipe(
        switchMap(context => authenticate$(context)),
        switchMap(() => initialize$())
    ).subscribe(
        () => ready$.complete()
    )

    return ready$
}

module.exports = job({
    jobName: 'EE Initialization',
    services: [limiter],
    worker$
})
