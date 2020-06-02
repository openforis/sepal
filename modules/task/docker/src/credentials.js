const {of, BehaviorSubject} = require('rxjs')
const {first, filter, switchMap} = require('rxjs/operators')
const fs = require('fs')
const fsPromises = require('fs/promises')
const config = require('root/config')
const path = require('path')
const log = require('sepal/log').getLogger('task')
const {google} = require('googleapis')

const CREDENTIALS_DIR = `${config.homeDir}/.config/earthengine`
const CREDENTIALS_FILE = 'credentials'
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, CREDENTIALS_FILE)

const credentials = userCredentials => ({
    serviceAccountCredentials: config.serviceAccountCredentials,
    userCredentials
})

const credentials$ = new BehaviorSubject(credentials())

const auth$ = () =>
    credentials$.pipe(
        first(),
        filter(({userCredentials}) => userCredentials),
        switchMap(({userCredentials}) => {
            const oAuth2Client = new google.auth.OAuth2()
            oAuth2Client.setCredentials({
                access_token: userCredentials.accessToken
            })
            return of(oAuth2Client)
        })
    )

const loadUserCredentials = () =>
    fsPromises.readFile(CREDENTIALS_PATH, {encoding: 'utf8'})
        .then(string => {
            const json = JSON.parse(string)
            // const credentials = json && ()
            updateUserCredentials({
                accessToken: json.access_token,
                accessTokenExpiryDate: json.access_token_expiry_date
            })
        })
        .catch(() => {
            updateUserCredentials()
            return log.info('No user credentials. Using service-account.')
        })

const updateUserCredentials = userCredentials =>
    credentials$.next(
        credentials(userCredentials)
    )
    
fs.watch(CREDENTIALS_DIR, (eventType, filename) => {
    if (filename === CREDENTIALS_FILE) {
        loadUserCredentials()
    }
})
    
loadUserCredentials()
    
module.exports = {credentials$, auth$}
