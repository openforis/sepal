const {switchMap, distinctUntilChanged} = require('rx/operators')
const ee = require('ee')
const {getCredentials} = require('root/context')
const log = require('sepal/log').getLogger('ee')
const moment = require('moment')

const secondsToExpiration = expiration => {
    const now = Date.now()
    const millisecondsLeft = expiration - now
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

const initialize$ = () =>
    ee.$({
        operation: 'initialize',
        ee: (resolve, reject) => ee.initialize(null, null, resolve, reject)
    })

const initializeEE$ = () => {
    const {userCredentials, serviceAccountCredentials} = getCredentials()
    const authenticate$ = userCredentials
        ? authenticateUserAccount$(userCredentials)
        : authenticateServiceAccount$(serviceAccountCredentials)
    return authenticate$.pipe(
        // tap(() => ee.data.setAuthTokenRefresher(authTokenRefresher)),
        switchMap(() => initialize$()),
        distinctUntilChanged() // ????
    )
}

// const authTokenRefresher = (authArgs, callback) => {
//     initializeEE$().subscribe({
//         error: callback({error}),
//         complete: callback(ee.data.getAuthToken())
//     })
// }

// fs.watch(CREDENTIALS_DIR, (eventType, filename) => {
//     if (filename === CREDENTIALS_FILE)
//         initializeEE$().subscribe()
// })

module.exports = {initializeEE$}
