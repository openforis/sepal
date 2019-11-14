const {before} = require('@sepal/job')
const log = require('@sepal/log')

const getSepalUser = ctx => {
    const sepalUser = ctx.request.headers['sepal-user']
    return sepalUser
        ? JSON.parse(sepalUser)
        : {}
}

const getCredentials = ctx => {
    const config = require('../config')
    const sepalUser = getSepalUser(ctx)
    const serviceAccountCredentials = config.serviceAccountCredentials
    return {
        sepalUser,
        serviceAccountCredentials
    }
}

const worker$ = ({sepalUser, serviceAccountCredentials}) => {
    const ee = require('@google/earthengine')
    const {concat} = require('rxjs')
    require('./extensions')

    const initialize = () =>
        new Promise((resolve, reject) => {
            log.trace('Initializing library')
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
            log.trace('Running EE authentication (service account)')
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
            log.trace('Running EE authentication (user account)')
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

module.exports = before({
    jobName: 'EE Authentication',
    worker$,
    args: ctx => [getCredentials(ctx)]
})
