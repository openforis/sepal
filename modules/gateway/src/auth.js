const {defer, firstValueFrom, of, catchError, map} = require('rxjs')
const {post$, postJson$} = require('sepal/httpClient')
const modules = require('./modules')
const log = require('sepal/log').getLogger('auth')

const REFRESH_IF_EXPIRES_IN_MINUTES = 10

const authenticationUrl = `http://${modules.user}/authenticate`
const refreshGoogleTokensUrl = `http://${modules.user}/google/refresh-access-token`

const authMiddleware = async (req, res, next) => {
    try {
        const isAuthenticated = () => !!(req.session && req.session.user)

        const hasAuthHeaders = () => {
            const header = req.get('Authorization')
            return header && header.toLowerCase().startsWith('basic ')
        }

        const refreshGoogleTokens$ = defer(() => {
            const user = req.session.user
            log.debug(`[${user.username}] [${req.originalUrl}] Refreshing Google tokens for user`)
            return postJson$(refreshGoogleTokensUrl, {
                headers: {'sepal-user': JSON.stringify(user)}
            }).pipe(
                map(({body: googleTokens}) => {
                    if (googleTokens) {
                        log.debug(() => `[${user.username}] [${req.originalUrl}] Refreshed Google tokens`)
                        req.session.user = {...user, googleTokens: JSON.parse(googleTokens)}
                        res.set('sepal-user', JSON.stringify(req.session.user))
                    } else {
                        log.warn(`[${user.username}] [${req.originalUrl}] Google tokens not refreshed - missing from response`)
                    }
                    return true
                })
            )
        })

        const verifyGoogleTokens$ = defer(() => {
            const user = req.session.user
            const shouldRefresh = () => {
                const expiresInMinutes = (user.googleTokens.accessTokenExpiryDate - new Date().getTime()) / 60 / 1000
                log.trace(`[${user.username}] [${req.originalUrl}] Google tokens expires in ${expiresInMinutes} minutes`)
                return expiresInMinutes < REFRESH_IF_EXPIRES_IN_MINUTES
            }
            if (!user.googleTokens || !user.googleTokens.accessTokenExpiryDate) {
                log.trace(`[${user.username}] [${req.originalUrl}] No Google tokens to verify for user`)
                return of(true)
            } else if (shouldRefresh()) {
                return refreshGoogleTokens$
            } else {
                log.trace(`[${user.username}] [${req.originalUrl}] No need to refresh Google tokens for user - more than ${REFRESH_IF_EXPIRES_IN_MINUTES} minutes left until expiry`)
                return of(true)
            }
        })

        const authenticate$ = defer(() => {
            const header = req.get('Authorization')
            const basicAuth = Buffer.from(header.substring('basic '.length), 'base64').toString()
            const [username, password, recaptchaToken] = basicAuth.split(':')
            log.trace(`[${username}] [${req.originalUrl}] Authenticating user`)
            return post$(authenticationUrl, {
                body: {username, password, recaptchaToken},
                validStatuses: [200, 401]
            }).pipe(
                map(response => {
                    const {body, statusCode} = response
                    switch(statusCode) {
                    case 200:
                        log.debug(() => `[${username}] [${req.originalUrl}] Authenticated user`)
                        req.session.user = JSON.parse(body)
                        return true
                    case 401:
                        log.debug(() => `[${username}] [${req.originalUrl}] Invalid credentials for user`)
                        if (!req.get('No-auth-challenge')) {
                            log.trace(`[${req.originalUrl}] Sending auth challenge`)
                            res.set('WWW-Authenticate', 'Basic realm="Sepal"')
                        }
                        res.status(401)
                        res.end()
                        return false
                    default:
                        log.error(`[${username}] [${req.originalUrl}] Error authenticating user`, statusCode, response.body)
                        res.status(500)
                        res.end()
                        return false
                    }
                })
            )
        })

        const send401$ = defer(() => {
            if (!req.get('No-auth-challenge')) {
                log.trace(`[${req.originalUrl}] Sending auth challenge`)
                res.set('WWW-Authenticate', 'Basic realm="Sepal"')
            } else {
                log.trace(`[${req.originalUrl}] Responding with 401`)
            }
            res.status(401)
            res.end()
            return of(false)
        })

        const result$ = isAuthenticated()
            ? verifyGoogleTokens$
            : hasAuthHeaders()
                ? authenticate$
                : send401$

        const shouldContinue = await firstValueFrom(
            result$.pipe(
                catchError(error => {
                    log.error(`[${req.originalUrl}] Got an unexpected error when trying to authenticate`, error)
                    res.status(500)
                    res.end()
                    return of(false)
                })
            )
        )
        shouldContinue && next()
    } catch(error) {
        log.error(error)
        res.status(500)
        res.end()
    }
}

module.exports = {authMiddleware}
