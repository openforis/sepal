const {BehaviorSubject} = require('rx')
const fs = require('fs')
// const fsPromises = require('fs/promises')
const path = require('path')
const log = require('sepal/log').getLogger('task')
// const {google} = require('googleapis')
// const {exists$} = require('root/rxjs/fileSystem')
const config = require('./config')

const CREDENTIALS_FILE = 'credentials'

// const credentialsDir = () => `${config.homeDir}/.config/earthengine`
// const credentialsPath = () => path.join(credentialsDir(), CREDENTIALS_FILE)

// const loadUserCredentials = () =>
//     fsPromises.readFile(credentialsPath(), {encoding: 'utf8'})
//         .then(string => {
//             const json = JSON.parse(string)
//             // const credentials = json && ()
//             updateUserCredentials({
//                 accessToken: json.access_token,
//                 accessTokenExpiryDate: json.access_token_expiry_date
//             })
//         })
//         .catch(() => {
//             updateUserCredentials()
//             return log.info('No user credentials. Using service-account.')
//         })

// const updateUserCredentials = userCredentials =>
//     credentials$.next(
//         credentials(userCredentials)
//     )
    
// fs.watch(credentialsDir, (eventType, filename) => {
//     if (filename === CREDENTIALS_FILE) {
//         loadUserCredentials()
//     }
// })
    
// loadUserCredentials()

// *******************

const data = {
    userCredentialsFile: null,
    config: null
}

const credentials = userCredentials => ({
    serviceAccountCredentials: data.config.serviceAccountCredentials,
    userCredentials,
    config: data.config
})

const credentials$ = new BehaviorSubject()

const credentialsDir = () =>
    `${data.config.homeDir}/.config/earthengine`

const credentialsPath = () =>
    path.join(credentialsDir(), CREDENTIALS_FILE)

const unmonitorUserCredentials = () => {
    if (data.userCredentialsFile) {
        fs.unwatchFile(data.userCredentialsFile)
    }
}

const monitorUserCredentials = () => {
    fs.watch(credentialsDir(), (_eventType, filename) => {
        if (filename === CREDENTIALS_FILE) {
            loadUserCredentialsSync()
        }
    })
}
    
const loadUserCredentialsSync = () => {
    try {
        const rawUserCredentials = fs.readFileSync(credentialsPath(), {encoding: 'utf8'})
        const userCredentials = JSON.parse(rawUserCredentials)
        data.userCredentials = userCredentials
        credentials$.next(credentials(userCredentials))
    } catch (error) {
        credentials$.next(credentials())
    }
}

const setConfig = config => {
    unmonitorUserCredentials()
    data.config = config
    credentials$.next(credentials())
    monitorUserCredentials()
    loadUserCredentialsSync()
}

const getConfig = () =>
    data.config

setConfig(config)
    
// =======
// exists$(CREDENTIALS_DIR).pipe(
//     filter(exists => exists),
//     tap(() => fs.watch(CREDENTIALS_DIR, (eventType, filename) => {
//         if (filename === CREDENTIALS_FILE) {
//             loadCredentials()
//         }
//     }))
// )
    
// loadCredentials()
// >>>>>>> 90957f1d9d221e5a31ab810aae53c4704519f49a
module.exports = {setConfig, credentials$, getConfig}
// module.exports = {credentials$, auth$}
