const {Subject, switchMap, first} = require('rxjs')
const ee = require('#sepal/ee')
const {getCredentials$} = require('#task/context')

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
    const initialized$ = new Subject()
    getCredentials$().pipe(
        switchMap(({userCredentials, serviceAccountCredentials}) =>
            userCredentials
                ? authenticateUserAccount$(userCredentials)
                : authenticateServiceAccount$(serviceAccountCredentials)
        ),
        switchMap(() => initialize$())
    ).subscribe(
        () => initialized$.next()
    )
    
    return initialized$.pipe(first())
}

module.exports = {initializeEE$}
