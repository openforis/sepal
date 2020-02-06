const {Subject} = require('rxjs')
const {first, map, switchMap, tap} = require('rxjs/operators')
const path = require('path')
const fs = require('fs')
const ee = require('ee')
const config = require('root/config')

const CREDENTIALS_DIR = `${config.homeDir}/.config/earthengine/`
const CREDENTIALS_FILENAME = 'credentials'
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, CREDENTIALS_FILENAME)

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
    ee.$('autenticate service account', (resolve, reject) => {
            ee.sepal.setAuthType('SERVICE_ACCOUNT')
            ee.data.authenticateViaPrivateKey(
                serviceAccountCredentials,
                () => resolve(),
                error => reject(error)
            )
        }
    )

const authenticateUserAccount$ = userCredentials =>
    ee.$('authenticate user account', (resolve, reject) => {
            ee.sepal.setAuthType('USER')
            ee.data.setAuthToken(
                null,
                'Bearer',
                userCredentials.accessToken,
                secondsToExpiration(userCredentials.accessTokenExpiryDate),
                null,
                error => error ? reject(error) : resolve(),
                false
            )
        }
    )

const initialize$ = () =>
    loadCredentials$(CREDENTIALS_FILE).pipe(
        switchMap(userCredentials => {
            const authenticate$ = userCredentials
                ? authenticateUserAccount$(userCredentials)
                : authenticateServiceAccount$(config.serviceAccountCredentials)
            return authenticate$.pipe(
                tap(() => ee.data.setAuthTokenRefresher(authTokenRefresher)),
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
        })
    )

const authTokenRefresher = (authArgs, callback) => {
    initialize$().subscribe({
        error: callback({error}),
        complete: callback(ee.data.getAuthToken())
    })
}

fs.watch(CREDENTIALS_DIR, (eventType, filename) => {
    if (filename === CREDENTIALS_FILENAME)
        initialize$().subscribe()
})


module.exports = initialize$

