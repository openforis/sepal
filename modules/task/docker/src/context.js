const {BehaviorSubject, defer, timer, of} = require('rx')
const {filter, switchMap, tap, first} = require('rx/operators')
const fs = require('fs')
const path = require('path')
const {mkdir$} = require('root/rxjs/fileSystem')
const log = require('sepal/log').getLogger('context')
const _ = require('lodash')

const CREDENTIALS_FILE = 'credentials'

const data = {
    config: null
}

const credentials$ = new BehaviorSubject()

const setConfig = config => {
    if (data.config) {
        log.debug('Configuration already set, ignored')
    } else {
        log.debug('Setting configuration')
        data.config = config
        monitorUserCredentials()
    }
}

const setCredentials = userCredentials => {
    const serviceAccountCredentials = data.config && data.config.serviceAccountCredentials
    if (userCredentials) {
        const tokenExpiration = userCredentials['access_token_expiry_date'] || 0
        const timeLeftMs = tokenExpiration - Date.now()
        const currentCredentials = credentials$.getValue()
        if (timeLeftMs > 0 && (!currentCredentials || !_.isEqual(userCredentials, currentCredentials.userCredentials))) {
            log.debug(`User credentials updated, expiring in ${Math.round(timeLeftMs / 1000)} seconds`)
            credentials$.next({userCredentials, serviceAccountCredentials})
        } else if (timeLeftMs <= 0) {
            log.warn('Received expired user credentials, ignored')
        } else {
            log.trace('User credentials unchanged')
        }
    } else {
        credentials$.next({serviceAccountCredentials})
    }
}

const credentialsDir = () =>
    `${data.config.homeDir}/.config/earthengine`

const credentialsPath = () =>
    path.join(credentialsDir(), CREDENTIALS_FILE)

const monitorUserCredentials = () => {
    const userCredentialsPath = credentialsPath()
    log.debug(`Monitoring user credentials in ${userCredentialsPath}`)
    mkdir$(credentialsDir(), {recursive: true}).pipe(
        switchMap(() =>
            timer(0, 1000 * 60).pipe(
                tap(() => loadUserCredentials())
            )
        )
    ).subscribe()
}
    
const loadUserCredentials = () => {
    const userCredentialsPath = credentialsPath()
    fs.promises.readFile(userCredentialsPath, {encoding: 'utf8'})
        .then(rawUserCredentials => {
            const userCredentials = JSON.parse(rawUserCredentials)
            setCredentials(userCredentials)
        })
        .catch(() => {
            log.trace('Missing of invalid user credentials file')
            setCredentials()
        })
}

const getConfig = () =>
    data.config

const getCredentials = () => {
    if (!data.config) {
        throw new Error('Cannot get credentials before setting config')
    }
    return credentials$.getValue()
}

const getCredentials$ = () =>
    credentials$.pipe(
        filter(credentials => credentials)
    )
    
const getCurrentCredentials$ = () =>
    defer(() => {
        const credentials = credentials$.getValue()
        return credentials
            ? of(credentials)
            : getCredentials$().pipe(
                first()
            )
    })
    
module.exports = {setConfig, getConfig, getCredentials, getCredentials$, getCurrentCredentials$}
