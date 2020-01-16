const {Subject} = require('rxjs')
const {first, map, switchMap} = require('rxjs/operators')
const fs = require('fs')
const ee = require('ee')
const config = require('./config')


const readJsonFile$ = filePath => {
    const data$ = new Subject()
    fs.access(filePath, error => {
        if (error) {
            data$.next()
        } else {
            fs.readFile(filePath, 'utf8', (error, data) => {
                if (error) {
                    data$.error(error)
                } else {
                    data$.next(JSON.parse(data))
                }
            })
        }
    })

    return data$
}

const secondsToExpiration = expiration => {
    const millisecondsLeft = expiration - Date.now()
    if (!millisecondsLeft < 0) {
        throw new Error('Token expired')
    }
    return millisecondsLeft / 1000
}

const loadCredentials$ = path =>
    readJsonFile$(path).pipe(
        map(json => json && ({accessToken: json.access_token, accessTokenExpiryDate: json.access_token_expiry_date})
        )
    )

const authenticateServiceAccount$ = serviceAccountCredentials =>
    ee.$('autenticate service account', (resolve, reject) =>
        ee.data.authenticateViaPrivateKey(
            serviceAccountCredentials,
            () => resolve(),
            error => reject(error)
        )
    )

const authenticateUserAccount$ = userCredentials =>
    ee.$('authenticate user account', resolve =>
        ee.data.setAuthToken(
            null,
            'Bearer',
            userCredentials.accessToken,
            secondsToExpiration(userCredentials.accessTokenExpiryDate),
            null,
            () => resolve(),
            false
        )
    )

const initialize$ = (userCredentials, serviceAccountCredentials) => {
    const authenticate$ = userCredentials
        ? authenticateUserAccount$(userCredentials)
        : authenticateServiceAccount$(serviceAccountCredentials)
    return authenticate$.pipe(
        switchMap(() =>
            ee.$('initalize', (resolve, reject) =>
                ee.initialize(
                    null,
                    null,
                    () => resolve(),
                    error => reject(error)
                )
            )
        )
    )
}


module.exports = loadCredentials$(`${config.homeDir}/.config/earthengine/credentials`).pipe(
    switchMap(userCredentials => initialize$(userCredentials, config.serviceAccountCredentials)),
    first()
)

