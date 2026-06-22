import {firstValueFrom, of, switchMap, tap} from 'rxjs'

import {get$, post$} from '#sepal/httpClient'
import {getLogger} from '#sepal/log'

import modules from '../config/modules.json' with {type: 'json'}
import {urlTag, usernameTag} from './tag.js'
import {getRequestUser, setRequestUser, setSessionUsername} from './user.js'

const log = getLogger('authMiddleware')

const AUTHENTICATION_URL = `http://${modules.userNode}/authenticate`
const API_KEY_AUTH_URL = `http://${modules.sepal}/api/sessions/api-key-authenticate`
const USER_LOOKUP_URL = `http://${modules.userNode}/info`

// sepal-user header the gateway sends itself to call [ADMIN] endpoints internally.
const INTERNAL_ADMIN_HEADER = {
    'sepal-user': JSON.stringify({
        username: 'sepal-gateway',
        roles: ['application_admin'],
        status: 'ACTIVE',
        systemUser: true
    })
}

const OK = 200
const UNAUTHORIZED = 401
const INTERNAL_SERVER_ERROR = 500

const AuthMiddleware = userStore => {
    const authMiddleware = async (req, res, next) => {
        try {
            const isAuthenticated = () => !!(getRequestUser(req))
    
            const hasBasicAuthHeaders = () => {
                const header = req.get('Authorization')
                return header && header.toLowerCase().startsWith('basic ')
            }

            const isGuiRequest = () =>
                req.header('No-auth-challenge')

            const authenticatedGuiRequest$ = (username, user) =>
                userStore.setUser$(user).pipe(
                    switchMap(() => of(OK).pipe(
                        tap(() => {
                            setSessionUsername(req, username)
                            setRequestUser(req, user)
                            log.debug(() => `${usernameTag(username)} ${urlTag(req.originalUrl)} Authenticated gui request`)
                        })
                    ))
                )

            const authenticatedNonGuiRequest$ = (username, user) =>
                of(OK).pipe(
                    tap(() => {
                        setRequestUser(req, user)
                        log.debug(() => `${usernameTag(username)} ${urlTag(req.originalUrl)} Authenticated non-gui request`)
                    })
                )
                
            const authorized$ = (username, response) => {
                const {body} = response
                const user = JSON.parse(body)
                return isGuiRequest()
                    ? authenticatedGuiRequest$(username, user)
                    : authenticatedNonGuiRequest$(username, user)
            }

            const unauthorized$ = username => {
                log.debug(() => `${usernameTag(username)} ${urlTag(req.originalUrl)} Invalid credentials for user`)
                if (!req.get('No-auth-challenge')) {
                    log.trace(`${urlTag(req.originalUrl)} Sending auth challenge`)
                    res.set('WWW-Authenticate', 'Basic realm="Sepal"')
                }
                return of(UNAUTHORIZED)
            }

            const failure$ = (username, response) => {
                const {body, statusCode} = response
                log.error(`${usernameTag(username)} ${urlTag(req.originalUrl)} Error authenticating user`, statusCode, body)
                return of(INTERNAL_SERVER_ERROR)
            }

            const getRequestHeaderCredentials = () => {
                const header = req.get('Authorization')
                const basicAuth = Buffer.from(header.substring('basic '.length), 'base64').toString()
                const [, rawUsername, password] = basicAuth.match(/([^:]*):(.*)/) || []
                const username = rawUsername?.toLowerCase()
                return {username, password}
            }

            const authenticate$ = () => {
                const {username, password} = getRequestHeaderCredentials()
                if (!password) {
                    log.warn(`${usernameTag(username)} Missing credentials`)
                    return unauthorized$(username)
                } else if (username) {
                    log.trace(`${usernameTag(username)} ${urlTag(req.originalUrl)} Authenticating user`)
                    return post$(AUTHENTICATION_URL, {
                        body: {username, password},
                        validStatuses: [OK, UNAUTHORIZED]
                    }).pipe(
                        switchMap(response => {
                            const {statusCode} = response
                            switch (statusCode) {
                                case OK: return authorized$(username, response)
                                case UNAUTHORIZED: return unauthorized$(username)
                                default: return failure$(username, response)
                            }
                        })
                    )
                } else {
                    log.trace(`${urlTag(req.originalUrl)} Authenticating via API key`)
                    return authenticateApiKey$(password)
                }
            }

            const authenticateApiKey$ = apiKey =>
                post$(API_KEY_AUTH_URL, {
                    body: {apiKey},
                    headers: INTERNAL_ADMIN_HEADER,
                    validStatuses: [OK, UNAUTHORIZED]
                }).pipe(switchMap(response => {
                    const {statusCode} = response
                    switch (statusCode) {
                        case OK: {
                            const {username} = JSON.parse(response.body)
                            return loadUser$(username)
                        }
                        case UNAUTHORIZED: return unauthorized$('')
                        default: return failure$('', response)
                    }
                }))

            const loadUser$ = username =>
                get$(USER_LOOKUP_URL, {
                    query: {username},
                    headers: INTERNAL_ADMIN_HEADER,
                    validStatuses: [OK, UNAUTHORIZED]
                }).pipe(switchMap(response => {
                    const {statusCode} = response
                    switch (statusCode) {
                        case OK: {
                            const user = JSON.parse(response.body)
                            return authenticatedNonGuiRequest$(username, user)
                        }
                        case UNAUTHORIZED: return unauthorized$(username)
                        default: return failure$(username, response)
                    }
                }))
    
            const missingAuthHeader$ = () => {
                if (!req.get('No-auth-challenge')) {
                    log.trace(`${urlTag(req.originalUrl)} Sending auth challenge`)
                    res.set('WWW-Authenticate', 'Basic realm="Sepal"')
                } else {
                    log.trace(`${urlTag(req.originalUrl)} Responding with 401`)
                }
                return of(UNAUTHORIZED)
            }
    
            const statusCode$ = isAuthenticated()
                ? of(OK)
                : hasBasicAuthHeaders()
                    ? authenticate$()
                    : missingAuthHeader$()
    
            const statusCode = await firstValueFrom(statusCode$)

            statusCode === OK
                ? next()
                : res.status(statusCode) && res.end()

        } catch(error) {
            log.error('Unexpected AuthMiddleware error', error)
            res.status(INTERNAL_SERVER_ERROR)
            res.end()
        }
    }
    
    return {authMiddleware}
}

export {AuthMiddleware}
