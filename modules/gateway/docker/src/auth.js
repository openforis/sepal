const {defer, firstValueFrom, of} = require('rxjs')
const {catchError, map} = require('rxjs/operators')
const {postForm$, postJson$} = require('sepal/httpClient')
const {modules} = require('./config')
const log = require('sepal/log').getLogger('auth')

const REFRESH_IF_EXPIRES_IN_MINUTES = 10

const authenticationUrl = `http://${modules.user}/authenticate`
const refreshGoogleTokensUrl = `http://${modules.user}/google/refresh-access-token`

const authMiddleware = async (req, res, next) => {
    const isAuthenticated = () => !!req.session.user

    const hasAuthHeaders = () => {
        const header = req.get('Authorization')
        return header && header.toLowerCase().startsWith('basic ')
    }

    const refreshGoogleTokens$ = defer(() => {
        const user = req.session.user
        log.debug(`[${user.username}] Refreshing Google tokens for user`)
        return postJson$(refreshGoogleTokensUrl, {
            headers: {'sepal-user': JSON.stringify(user)}
        }).pipe(
            map(({body: googleTokens}) => {
                if (googleTokens) {
                    log.debug(`[${user.username}] Refreshed Google tokens for user`)
                    req.session.user = {...user, googleTokens}
                } else {
                    log.debug(`[${user.username}] Google tokens not refreshed for user`)
                }
                return true
            })
        )
    })

    const verifyGoogleTokens$ = defer(() => {
        const user = req.session.user
        const shouldRefresh = () => {
            const expiresInMinutes = user.googleTokens.accessTokenExpiryDate - new Date().getTime() / 60 / 1000
            return expiresInMinutes < REFRESH_IF_EXPIRES_IN_MINUTES
        }
        if (!user.googleTokens || !user.googleTokens.accessTokenExpiryDate) {
            log.trace(`[${user.username}] No Google tokens to verify for user`)
            return of(true)
        } else if (shouldRefresh()) {
            return refreshGoogleTokens$
        } else {
            log.trace(`[${user.username}] No need to refresh Google tokens for user`)
            return of(true)
        }
    })

    const authenticate$ = defer(() => {
        const header = req.get('Authorization')
        const [username, password] = Buffer.from(
            header.substring('basic '.length),
            'base64'
        ).toString().split(':')
        log.trace(`[${username}] Authenticating user`)
        return postForm$(authenticationUrl, {
            body: {username, password},
            validStatuses: [200, 401]
        }).pipe(
            map(response => {
                const {body, statusCode} = response
                switch(statusCode) {
                case 200:
                    log.debug(`[${username}] Authenticated user`)
                    req.session.user = JSON.parse(body)
                    return true
                case 401:
                    log.debug(`[${username}] Invalid credentials for user`)
                    if (!req.get('No-auth-challenge')) {
                        log.trace('Sending auth challenge')
                        res.set('WWW-Authenticate', 'Basic realm="Sepal"')
                    }
                    res.status(401)
                    res.end()
                    return false
                default:
                    log.error(`[${username}] Error authenticating user`, response)
                    res.status(500)
                    res.end()
                    return false
                }
            })
        )
    })

    const send401$ = defer(() => {
        if (!req.get('No-auth-challenge')) {
            log.trace('Sending auth challenge')
            res.set('WWW-Authenticate', 'Basic realm="Sepal"')
        } else {
            log.trace('Responding with 401')
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
                log.error('Got an unexpected error when trying to authenticate', error)
                res.status(500)
                res.end()
                return of(false)
            })
        )
    )
    shouldContinue && next()
}

module.exports = {authMiddleware}
