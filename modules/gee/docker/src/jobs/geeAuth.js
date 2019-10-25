const log = require('../log')

const getCredentials = ctx => {
    const config = require('../config')
    const sepalUser = JSON.parse(ctx.request.headers['sepal-user'])
    const serviceAccountCredentials = config.serviceAccountCredentials
    return {
        sepalUser,
        serviceAccountCredentials
    }
}

const worker$ = ({sepalUser, serviceAccountCredentials}) => {
    const ee = require('@google/earthengine')
    const {concat} = require('rxjs')

    log.info('Running EE authentication')
    
    const initialize = () =>
        new Promise((resolve, reject) => {
            log.debug('Initializing library')
            try {
                ee.initialize(
                    null,
                    null,
                    () => resolve(),
                    error => reject(error)
                )
            } catch (error) {
                reject(error)
            }
        })
    
    const authenticateServiceAccount = credentials =>
        new Promise((resolve, reject) => {
            log.debug('Authenticating service account')
            try {
                ee.data.authenticateViaPrivateKey(
                    credentials,
                    () => resolve(),
                    error => reject(error)
                )
            } catch (error) {
                reject(error)
            }
        })
    
    const authenticateUserAccount = googleTokens =>
        new Promise((resolve, reject) => {
            log.debug('Authenticating user account')
            const secondsToExpiration = (googleTokens.accessTokenExpiryDate - Date.now()) / 1000
            try {
                ee.data.setAuthToken(
                    null,
                    'Bearer',
                    googleTokens.accessToken,
                    secondsToExpiration,
                    null,
                    () => resolve(),
                    false
                )
            } catch (error) {
                reject(error)
            }
        })
    
    const authenticate = ({sepalUser: {googleTokens}, serviceAccountCredentials}) =>
        googleTokens
            ? authenticateUserAccount(googleTokens)
            : authenticateServiceAccount(serviceAccountCredentials)

    return concat(
        authenticate({sepalUser, serviceAccountCredentials}),
        initialize()
    )
}

module.exports = ctx => ctx
    ? [getCredentials(ctx)]
    : worker$
