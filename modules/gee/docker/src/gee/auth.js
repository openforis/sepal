const ee = require('@google/earthengine')
const {from, concatAll} = require('rxjs')

const log = require('../log')

const initialize = () =>
    from(
        new Promise(resolve => {
            log.debug('Initializing library')
            ee.initialize(null, null, () => resolve())
        })
    )

const authenticateServiceAccount = credentials =>
    from(
        new Promise(resolve => {
            log.debug('Authenticating service account')
            ee.data.authenticateViaPrivateKey(
                credentials,
                () => resolve()
            )
        })
    )

const authenticateUserAccount = googleTokens =>
    from(
        new Promise(resolve => {
            log.debug('Authenticating user account')
            const secondsToExpiration = (googleTokens.accessTokenExpiryDate - Date.now()) / 1000
            ee.data.setAuthToken(
                null,
                'Bearer',
                googleTokens.accessToken,
                secondsToExpiration,
                null,
                () => resolve(),
                false
            )
        })
    )

const authenticate = ({sepalUser: {googleTokens}, serviceAccountCredentials}) =>
    googleTokens
        ? authenticateUserAccount(googleTokens)
        : authenticateServiceAccount(serviceAccountCredentials)

module.exports = ({sepalUser, serviceAccountCredentials}) =>
    concatAll([
        authenticate({sepalUser, serviceAccountCredentials}),
        initialize()
    ])
