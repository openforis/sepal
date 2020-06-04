const {switchMap, filter, distinctUntilChanged} = require('rx/operators')
const ee = require('ee')
const config = require('root/config')
const {credentials$} = require('root/credentials')

const secondsToExpiration = expiration => {
    const millisecondsLeft = expiration - Date.now()
    if (!millisecondsLeft < 0) {
        throw new Error('Token expired')
    }
    return millisecondsLeft / 1000
}

// const CREDENTIALS_DIR = `${config.homeDir}/.config/earthengine`
// const CREDENTIALS_FILE = 'credentials'

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
                userCredentials.accessToken,
                secondsToExpiration(userCredentials.accessTokenExpiryDate),
                null,
                error => error ? reject(error) : resolve(),
                false
            )
        }
    })

const initializeEE$ = () =>
    // loadCredentials$().pipe(
    credentials$.pipe(
        filter(userCredentials => userCredentials !== undefined),
        switchMap(userCredentials => {
            const authenticate$ = userCredentials
                ? authenticateUserAccount$(userCredentials)
                : authenticateServiceAccount$(config.serviceAccountCredentials)
            return authenticate$.pipe(
                // tap(() => ee.data.setAuthTokenRefresher(authTokenRefresher)),
                switchMap(() =>
                    ee.$({
                        operation: 'initialize',
                        ee: (resolve, reject) => ee.initialize(null, null, resolve, reject)
                    })
                )
            )
        }),
        distinctUntilChanged()
    )

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
