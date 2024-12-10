const {defer, firstValueFrom, from, of, catchError, switchMap} = require('rxjs')
const {post$} = require('#sepal/httpClient')
const modules = require('../config/modules')
const {usernameTag, urlTag} = require('./tag')
const {getRequestUser, setRequestUser, setSessionUsername} = require('./user')
const log = require('#sepal/log').getLogger('auth')

const authenticationUrl = `http://${modules.user}/authenticate`

const Auth = userStore => {
    const authMiddleware = async (req, res, next) => {
        try {
            const isAuthenticated = () => !!(getRequestUser(req))
    
            const hasAuthHeaders = () => {
                const header = req.get('Authorization')
                return header && header.toLowerCase().startsWith('basic ')
            }
    
            const authenticated$ = (username, response) => {
                const {body} = response
                log.debug(() => `${usernameTag(username)} ${urlTag(req.originalUrl)} Authenticated user`)
                const user = JSON.parse(body)
                setSessionUsername(req, username)
                setRequestUser(req, user)
                return from(userStore.setUser(user))
            }

            const invalidCredentials$ = username => {
                log.debug(() => `${usernameTag(username)} ${urlTag(req.originalUrl)} Invalid credentials for user`)
                if (!req.get('No-auth-challenge')) {
                    log.trace(`${urlTag(req.originalUrl)} Sending auth challenge`)
                    res.set('WWW-Authenticate', 'Basic realm="Sepal"')
                }
                res.status(401)
                res.end()
                return of(false)
            }

            const failure$ = (username, response) => {
                const {body, statusCode} = response
                log.error(`${usernameTag(username)} ${urlTag(req.originalUrl)} Error authenticating user`, statusCode, body)
                res.status(500)
                res.end()
                return of(false)
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
                res.status(401)
                res.end()
                return of(false)
            })
    
            const result$ = isAuthenticated()
                ? of(true)
                : hasAuthHeaders()
                    ? authenticate$
                    : send401$
    
            const shouldContinue = await firstValueFrom(
                result$.pipe(
                    catchError(error => {
                        log.error(`${urlTag(req.originalUrl)} Got an unexpected error when trying to authenticate`, error)
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
    
    return {authMiddleware}
}

module.exports = {Auth}
