const {tap} = require('rx/operators')
const fs = require('fs')
const path = require('path')
const {mkdir$} = require('root/rxjs/fileSystem')
const log = require('sepal/log').getLogger('task')

const CREDENTIALS_FILE = 'credentials'

const data = {
    config: null,
    userCredentials: null
}

const setConfig = config => {
    if (data.config) {
        log.warn('Configuration already set, ignored')
    } else {
        log.debug('Setting configuration')
        data.config = config
        monitorUserCredentials()
        loadUserCredentialsSync()
    }
}

const setUserCredentials = userCredentials => {
    if (userCredentials && userCredentials['access_token_expiry_date'] < Date.now()) {
        log.warn('Received expired user credentials, ignored')
    } else {
        data.userCredentials = userCredentials
    }
}

const credentialsDir = () =>
    `${data.config.homeDir}/.config/earthengine`

const credentialsPath = () =>
    path.join(credentialsDir(), CREDENTIALS_FILE)

const monitorUserCredentials = () => {
    mkdir$(credentialsDir(), {recursive: true}).pipe(
        tap(() =>
            fs.watch(credentialsDir(), (_eventType, filename) => {
                if (filename === CREDENTIALS_FILE) {
                    loadUserCredentialsSync()
                }
            })
        )
    ).subscribe()
}
    
const loadUserCredentialsSync = () => {
    const userCredentialsPath = credentialsPath()
    log.debug(`Reading user credentials: ${userCredentialsPath}`)
    try {
        const rawUserCredentials = fs.readFileSync(userCredentialsPath, {encoding: 'utf8'})
        const userCredentials = JSON.parse(rawUserCredentials)
        log.debug('User credentials updated')
        setUserCredentials(userCredentials)
    } catch (error) {
        log.debug('Failed to update credentials')
        setUserCredentials()
    }
}

const getConfig = () =>
    data.config

const getCredentials = () => {
    if (!data.config) {
        throw new Error('Cannot get credentials before setting config')
    }
    return {
        userCredentials: data.userCredentials,
        serviceAccountCredentials: data.config && data.config.serviceAccountCredentials
    }
}
    
module.exports = {setConfig, getConfig, getCredentials}
