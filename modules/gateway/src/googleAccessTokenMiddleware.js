import {catchError, firstValueFrom, map, of, switchMap, tap} from 'rxjs'

import {getLogger} from '#sepal/log'

import {isRefreshRequired} from './googleAccessToken.js'
import {urlTag, usernameTag} from './tag.js'
import {getRequestUser, setRequestUser} from './user.js'
import {updateGoogleAccessToken$} from './userApi.js'

const log = getLogger('googleAccessTokenMiddleware')

const INTERNAL_SERVER_ERROR = 500

const GoogleAccessTokenMiddleware = userStore => {
    const googleAccessTokenMiddleware = async (req, res, next) => {
        try {
            const user = getRequestUser(req)

            const refreshGoogleTokens$ = () => {
                log.debug(`${usernameTag(user.username)} ${urlTag(req.originalUrl)} Google tokens refreshing...`)
                return updateGoogleAccessToken$(user).pipe(
                    catchError(error => {
                        log.warn(`${usernameTag(user.username)} Failed to refresh Google tokens`, error)
                        return of(null)
                    }),
                    switchMap(refreshedUser => {
                        if (!refreshedUser) {
                            return userStore.getUser$(user.username)
                        }
                        const {username, googleTokens} = refreshedUser
                        return userStore.updateGoogleTokens$({username, googleTokens}).pipe(
                            catchError(error => {
                                log.warn(`${usernameTag(username)} Failed to cache refreshed Google tokens`, error)
                                return userStore.getUser$(username).pipe(
                                    map(currentUser => ({...currentUser, googleTokens}))
                                )
                            }),
                            tap(updatedUser => {
                                log.info(`${usernameTag(updatedUser.username)} ${urlTag(req.originalUrl)} Google tokens refreshed`)
                            })
                        )
                    }),
                    tap(currentUser => setRequestUser(req, currentUser))
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

            await firstValueFrom(refreshGoogleTokensIfNeeded$())

            next()
        } catch(error) {
            log.fatal('Unexpected GoogleAccessTokenMiddleware error', error)
            res.status(INTERNAL_SERVER_ERROR)
            res.end()
        }
    }
    
    return {googleAccessTokenMiddleware}
}

export {GoogleAccessTokenMiddleware}
