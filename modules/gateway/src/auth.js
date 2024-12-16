const {defer, firstValueFrom, from, of, switchMap} = require('rxjs')
const {post$} = require('#sepal/httpClient')
const modules = require('../config/modules')
const {usernameTag, urlTag} = require('./tag')
const {getRequestUser, setRequestUser, setSessionUsername} = require('./user')
const log = require('#sepal/log').getLogger('auth')

const authenticationUrl = `http://${modules.user}/authenticate`

const AUTHENTICATION_SUCCEEDED = 200
const AUTHENTICATION_FAILED = 401
const AUTHENTICATION_ERROR = 500

const Auth = userStore => {
    const authMiddleware = async (req, res, next) => {
        try {
            const isAuthenticated = () => !!(getRequestUser(req))
    
            const hasBasicAuthHeaders = () => {
                const header = req.get('Authorization')
                return header && header.toLowerCase().startsWith('basic ')
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
                ? of(AUTHENTICATION_SUCCEEDED)
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
