const {firstValueFrom, switchMap, catchError, tap, of} = require('rxjs')
const {usernameTag, urlTag} = require('./tag')
const {getRequestUser, setRequestUser} = require('./user')
const {updateGoogleAccessToken$} = require('./userApi')
const {isRefreshRequired} = require('./googleAccessToken')
const log = require('#sepal/log').getLogger('googleAccessTokenMiddleware')

const INTERNAL_SERVER_ERROR = 500

const GoogleAccessTokenMiddleware = userStore => {
    const googleAccessTokenMiddleware = async (req, res, next) => {
        try {
            const user = getRequestUser(req)

            const updateUser$ = updatedUser => {
                setRequestUser(req, updatedUser)
                return userStore.setUser$(updatedUser)
            }

            const refreshGoogleTokens$ = () => {
                log.debug(`${usernameTag(user.username)} ${urlTag(req.originalUrl)} Google tokens refreshing...`)
                return updateGoogleAccessToken$(user).pipe(
                    switchMap(updatedUser => updateUser$(updatedUser)),
                    tap(updatedUser =>
                        log.info(`${usernameTag(updatedUser.username)} ${urlTag(req.originalUrl)} Google tokens refreshed`)
                    )
                )
            }
    
            const refreshGoogleTokensIfNeeded$ = () => {
                if (user?.googleTokens?.accessTokenExpiryDate) {
                    if (isRefreshRequired(user.googleTokens)) {
                        return refreshGoogleTokens$()
                    } else {
                        log.trace(`${usernameTag(user.username)} ${urlTag(req.originalUrl)} No need to refresh Google tokens for user`)
                    }
                } else {
                    log.trace(`${usernameTag(user.username)} ${urlTag(req.originalUrl)} No Google tokens to verify for user`)
                }
                return of(true)
            }

            await firstValueFrom(
                refreshGoogleTokensIfNeeded$().pipe(
                    catchError(error => {
                        log.warn(`${usernameTag(user.username)} Failed to refresh Google tokens`, error)
                    })
                )
            )

            next()
        } catch(error) {
            log.fatal('Unexpected GoogleAccessTokenMiddleware error', error)
            res.status(INTERNAL_SERVER_ERROR)
            res.end()
        }
    }
    
    return {googleAccessTokenMiddleware}
}

module.exports = {GoogleAccessTokenMiddleware}
