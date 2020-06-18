const job = require('root/jobs/job')

const worker$ = () => {
    const {swallow} = require('sepal/rxjs/operators')
    const ee = require('ee')
    const {getCredentials} = require('root/context')

    const credentials = getCredentials()

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

    const authenticate$ = ({userCredentials, serviceAccountCredentials}) =>
        userCredentials
            ? authenticateUserAccount$(userCredentials)
            : authenticateServiceAccount$(serviceAccountCredentials)

    return authenticate$(credentials).pipe(
        swallow()
    )
}

module.exports = job({
    jobName: 'EE Authentication',
    worker$
})
