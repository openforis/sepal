const {map, defer, firstValueFrom, from, of, switchMap} = require('rxjs')
const {post$} = require('#sepal/httpClient')
const modules = require('../config/modules')
const {usernameTag, urlTag} = require('./tag')
const {getRequestUser, setRequestUser, setSessionUsername, SEPAL_USER_HEADER} = require('./user')
const {updateGoogleAccessToken$} = require('./userApi')
const log = require('#sepal/log').getLogger('auth')

const authenticationUrl = `http://${modules.user}/authenticate`

const AUTHENTICATION_SUCCEEDED = 200
const AUTHENTICATION_FAILED = 401
const AUTHENTICATION_ERROR = 500
const REFRESH_IF_EXPIRES_IN_MINUTES = 10

const Auth = userStore => {
    const authMiddleware = async (req, res, next) => {
        try {
            const isAuthenticated = () => !!(getRequestUser(req))
    
            const hasBasicAuthHeaders = () => {
                const header = req.get('Authorization')
                return header && header.toLowerCase().startsWith('basic ')
            }

            const userWithGoogleAccessToken$ = user => {
                res.set(SEPAL_USER_HEADER, JSON.stringify(user))
                return from(userStore.setUser(user))
            }

            const refreshGoogleTokens$ = () => {
                const user = getRequestUser(req)
                log.debug(`${usernameTag(user.username)} ${urlTag(req.originalUrl)} Refreshing Google tokens for user`)
                return updateGoogleAccessToken$(user).pipe(
                    switchMap(user => user
                        ? userWithGoogleAccessToken$(user)
                        : of(true)
                    )
                )
            }
    
            const shouldRefreshGoogleTokens = user => {
                const expiresInMinutes = (user.googleTokens.accessTokenExpiryDate - new Date().getTime()) / 60 / 1000
                log.trace(() => `${usernameTag(user.username)} ${urlTag(req.originalUrl)} Google tokens expires in ${expiresInMinutes} minutes`)
                return expiresInMinutes < REFRESH_IF_EXPIRES_IN_MINUTES
            }

            const verifyGoogleTokens$ = () => {
                const user = getRequestUser(req)
                if (user?.googleTokens?.accessTokenExpiryDate) {
                    if (shouldRefreshGoogleTokens(user)) {
                        return refreshGoogleTokens$()
                    } else {
                        log.isTrace() && log.trace(`${usernameTag(user.username)} ${urlTag(req.originalUrl)} No need to refresh Google tokens for user - more than ${REFRESH_IF_EXPIRES_IN_MINUTES} minutes left until expiry`)
                        return of(true)
                    }
                } else {
                    log.isTrace() && log.trace(`${usernameTag(user.username)} ${urlTag(req.originalUrl)} No Google tokens to verify for user`)
                    return of(true)
                }
            }

            const authenticated$ = (username, response) => {
                const {body} = response
                log.debug(() => `${usernameTag(username)} ${urlTag(req.originalUrl)} Authenticated user`)
                const user = JSON.parse(body)
                return from(userStore.setUser(user)).pipe(
                    switchMap(() => {
                        setSessionUsername(req, username)
                        setRequestUser(req, user)
                        return of(AUTHENTICATION_SUCCEEDED)
                    })
                )
            }

            const invalidCredentials$ = username => {
                log.debug(() => `${usernameTag(username)} ${urlTag(req.originalUrl)} Invalid credentials for user`)
                if (!req.get('No-auth-challenge')) {
                    log.trace(`${urlTag(req.originalUrl)} Sending auth challenge`)
                    res.set('WWW-Authenticate', 'Basic realm="Sepal"')
                }
                return of(AUTHENTICATION_FAILED)
            }

            const failure$ = (username, response) => {
                const {body, statusCode} = response
                log.error(`${usernameTag(username)} ${urlTag(req.originalUrl)} Error authenticating user`, statusCode, body)
                return of(AUTHENTICATION_ERROR)
            }

            const authenticate$ = defer(() => {
                const header = req.get('Authorization')
                const basicAuth = Buffer.from(header.substring('basic '.length), 'base64').toString()
                const [username, password] = basicAuth.split(':')
                log.trace(`${usernameTag(username)} ${urlTag(req.originalUrl)} Authenticating user`)
                return post$(authenticationUrl, {
                    body: {username, password},
                    validStatuses: [200, 401]
                }).pipe(
                    switchMap(response => {
                        const {statusCode} = response
                        switch (statusCode) {
                        case 200: return authenticated$(username, response)
                        case 401: return invalidCredentials$(username)
                        default: return failure$(username, response)
                        }
                    })
                )
            })
    
            const send401$ = defer(() => {
                if (!req.get('No-auth-challenge')) {
                    log.trace(`${urlTag(req.originalUrl)} Sending auth challenge`)
                    res.set('WWW-Authenticate', 'Basic realm="Sepal"')
                } else {
                    log.trace(`${urlTag(req.originalUrl)} Responding with 401`)
                }
                return of(AUTHENTICATION_FAILED)
            })
    
            const statusCode$ = isAuthenticated()
                ? verifyGoogleTokens$().pipe(
                    map(success => success ? AUTHENTICATION_SUCCEEDED : AUTHENTICATION_FAILED)
                )
                : hasBasicAuthHeaders()
                    ? authenticate$
                    : send401$
    
            const statusCode = await firstValueFrom(statusCode$)

            statusCode === AUTHENTICATION_SUCCEEDED
                ? next()
                : res.status(statusCode) && res.end()

        } catch(error) {
            log.fatal(error)
            res.status(500)
            res.end()
        }
    }
    
    return {authMiddleware}
}

module.exports = {Auth}
