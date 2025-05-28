const {firstValueFrom, of, switchMap, tap} = require('rxjs')
const {post$} = require('#sepal/httpClient')
const modules = require('../config/modules')
const {usernameTag, urlTag} = require('./tag')
const {getRequestUser, setRequestUser, setSessionUsername} = require('./user')
const log = require('#sepal/log').getLogger('authMiddleware')

const AUTHENTICATION_URL = `http://${modules.user}/authenticate`

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

            const authenticate$ = () => {
                const header = req.get('Authorization')
                const basicAuth = Buffer.from(header.substring('basic '.length), 'base64').toString()
                const [rawUsername, password] = basicAuth.split(':')
                const username = rawUsername.toLowerCase()
                if (username && password) {
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
                    log.warn(`${usernameTag(username)} Missing credentials`)
                    return unauthorized$(username)
                }
            }
    
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

module.exports = {AuthMiddleware}
