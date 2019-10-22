const ee = require('@google/earthengine')
const {parentPort} = require('worker_threads')

const geeInit = callback =>
    ee.initialize(null, null, () =>
        callback()
    )

const geeServiceAccount = (credentials, callback) => {
    console.log('Authenticating with service account')
    ee.data.authenticateViaPrivateKey(
        credentials,
        () => geeInit(callback)
    )
}

const geeUserAccount = (googleTokens, callback) => {
    console.log('Authenticating with user account')
    const secondsToExpiration = (googleTokens.accessTokenExpiryDate - Date.now()) / 1000
    ee.data.setAuthToken(
        null,
        'Bearer',
        googleTokens.accessToken,
        secondsToExpiration,
        null,
        () => geeInit(callback),
        false
    )
}

const gee = (sepalUser, serviceAccountCredentials, callback) => {
    const googleTokens = sepalUser.googleTokens
    return googleTokens
        ? geeUserAccount(googleTokens, callback)
        : geeServiceAccount(serviceAccountCredentials, callback)
}

parentPort.once('message', ({jobPort}) => {
    jobPort.once('message', ({sepalUser, serviceAccountCredentials, modulePath, args}) => {
        gee(sepalUser, serviceAccountCredentials, () => {
            const func = require(modulePath)
            jobPort.postMessage(
                func(...args)
            )
        })
    })
})
