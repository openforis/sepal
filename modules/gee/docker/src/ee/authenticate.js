const job = require('@sepal/worker/job')
const log = require('@sepal/log')('ee')

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
    const {EMPTY} = require('rxjs')
    const {switchMapTo} = require('rxjs/operators')
    const ee = require('@google/earthengine')
    const {ee$} = require('@sepal/ee/utils')
    require('./extensions')

    const authenticateServiceAccount$ = credentials =>
        ee$((resolve, reject) => {
            log.debug('Running EE authentication (service account)')
            ee.data.authenticateViaPrivateKey(
                credentials,
                () => resolve(),
                error => reject(error)
            )
        })

    const authenticateUserAccount$ = googleTokens =>
        ee$(resolve => {
            log.debug('Running EE authentication (user account)')
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

    const authenticate$ = ({sepalUser: {googleTokens}, serviceAccountCredentials}) =>
        googleTokens
            ? authenticateUserAccount$(googleTokens)
            : authenticateServiceAccount$(serviceAccountCredentials)

    return authenticate$({sepalUser, serviceAccountCredentials}).pipe(
        switchMapTo(EMPTY)
    )
}

module.exports = job({
    jobName: 'EE Authentication',
    worker$,
    args: ctx => [getCredentials(ctx)]
})
