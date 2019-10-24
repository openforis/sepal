const ee = require('@google/earthengine')
const log = require('../log')

const initialize = () => {
    log.debug('Initializing library')
    return new Promise(resolve =>
        ee.initialize(null, null, () => resolve())
    )
}

const authenticateServiceAccount = credentials => {
    log.debug('Authenticating service account')
    return new Promise(resolve =>
        ee.data.authenticateViaPrivateKey(
            credentials,
            () => resolve()
        )
    )
}

const authenticateUserAccount = googleTokens => {
    log.debug('Authenticating user account')
    return new Promise(resolve => {
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
}

module.exports = async ({sepalUser, serviceAccountCredentials}) => {
    const googleTokens = sepalUser.googleTokens
    await googleTokens
        ? authenticateUserAccount(googleTokens)
        : authenticateServiceAccount(serviceAccountCredentials)
    await initialize()
}
