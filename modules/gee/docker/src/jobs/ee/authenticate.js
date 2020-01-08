const job = require('root/jobs/job')

const getSepalUser = ctx => {
    const sepalUser = ctx.request.headers['sepal-user']
    return sepalUser
        ? JSON.parse(sepalUser)
        : {}
}

const getCredentials = ctx => {
    const config = require('../../config')
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
    const {ee$} = require('root/ee/utils')
    require('../../ee/extensions')

    const secondsToExpiration = expiration =>
        (expiration - Date.now()) / 1000

    const authenticateServiceAccount$ = credentials =>
        ee$('autenticate service account', (resolve, reject) =>
            ee.data.authenticateViaPrivateKey(
                credentials,
                () => resolve(),
                error => reject(error)
            )
        )

    const authenticateUserAccount$ = googleTokens =>
        ee$('authenticate user account', resolve =>
            ee.data.setAuthToken(
                null,
                'Bearer',
                googleTokens.accessToken,
                secondsToExpiration(googleTokens.accessTokenExpiryDate),
                null,
                () => resolve(),
                false
            )
        )

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
