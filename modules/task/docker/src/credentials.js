const {of, BehaviorSubject} = require('rxjs')
const {filter, first, switchMap, tap} = require('rxjs/operators')
const fs = require('fs')
const fsPromises = require('fs/promises')
const config = require('root/config')
const path = require('path')
const log = require('sepal/log').getLogger('task')
const {google} = require('googleapis')
const {exists$} = require('root/rxjs/fileSystem')

const CREDENTIALS_DIR = `${config.homeDir}/.config/earthengine`
const CREDENTIALS_FILE = 'credentials'
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, CREDENTIALS_FILE)

const credentials$ = new BehaviorSubject()

const auth$ = () =>
    credentials$.pipe(
        first(),
        switchMap(credentials => {
            const oAuth2Client = new google.auth.OAuth2()
            oAuth2Client.setCredentials({
                access_token: credentials.accessToken
            })
            return of(oAuth2Client)
        })
    )

const loadCredentials = () =>
    fsPromises.readFile(CREDENTIALS_PATH, {encoding: 'utf8'})
        .then(string => {
            const json = JSON.parse(string)
            const credentials = json && ({
                accessToken: json.access_token,
                accessTokenExpiryDate: json.access_token_expiry_date
            })
            credentials$.next(credentials)
        })
        .catch(error => {
            credentials$.next(null)
            return log.info('No user credentials. Using service-account.')
        })

exists$(CREDENTIALS_DIR).pipe(
    filter(exists => exists),
    tap(() => fs.watch(CREDENTIALS_DIR, (eventType, filename) => {
        if (filename === CREDENTIALS_FILE) {
            loadCredentials()
        }
    }))
)
    
loadCredentials()
    
// module.exports = {loadCredentials$, credentials$, auth$}
module.exports = {credentials$, auth$}
