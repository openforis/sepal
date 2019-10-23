const ee = require('@google/earthengine')

const initialize = callback =>
    ee.initialize(null, null, () =>
        callback()
    )

const authenticateServiceAccount = (credentials, callback) => {
    console.log('Authenticating service account')
    ee.data.authenticateViaPrivateKey(
        credentials,
        () => initialize(callback)
    )
}

const authenticateUserAccount = (googleTokens, callback) => {
    console.log('Authenticating user account')
    const secondsToExpiration = (googleTokens.accessTokenExpiryDate - Date.now()) / 1000
    ee.data.setAuthToken(
        null,
        'Bearer',
        googleTokens.accessToken,
        secondsToExpiration,
        null,
        () => initialize(callback),
        false
    )
}

module.exports = ({sepalUser, serviceAccountCredentials}, callback) => {
    const googleTokens = sepalUser.googleTokens
    return googleTokens
        ? authenticateUserAccount(googleTokens, callback)
        : authenticateServiceAccount(serviceAccountCredentials, callback)
}
