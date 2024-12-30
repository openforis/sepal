const {defer, groupBy, mergeMap, tap, takeUntil, filter, timer, switchMap, of, from, map, repeat, takeWhile, retry, catchError} = require('rxjs')
const {userTag} = require('./tag')
const modules = require('../config/modules')
const {postJson$} = require('#sepal/httpClient')
const {SEPAL_USER_HEADER} = require('./user')
const {USER_UP, USER_DOWN} = require('./websocket-events')
const log = require('#sepal/log').getLogger('googleAccessToken')

const REFRESH_GOOGLE_ACCESS_TOKEN_URL = `http://${modules.user}/google/refresh-access-token`
const REVOKE_GOOGLE_ACCESS_URL = `http://${modules.user}/google/revoke-access`
const REFRESH_IF_EXPIRES_IN_MINUTES = 10
const MIN_REFRESH_DELAY_MS = 60 * 1000

const refreshGoogleAccessToken$ = user => {
    log.debug(`${userTag(user.username)} Refreshing Google access token`)
    return postJson$(REFRESH_GOOGLE_ACCESS_TOKEN_URL, {
        headers: {
            [SEPAL_USER_HEADER]: JSON.stringify(user)
        }
    })
}

const revokeGoogleAccess$ = user => {
    log.warn(`${userTag(user?.username)} Revoking Google access token`)
    return postJson$(REVOKE_GOOGLE_ACCESS_URL, {
        headers: {
            [SEPAL_USER_HEADER]: JSON.stringify(user)
        }
    }).pipe(
        map(({body}) => JSON.parse(body))
    )
}
    
const initializeGoogleAccessTokenRefresher = ({userStore, userStatus$, toUser$}) => {
    const userConnected$ = userStatus$.pipe(
        filter(({event}) => event === USER_UP),
        map(({user}) => user)
    )

    const userDisconnected$ = userStatus$.pipe(
        filter(({event}) => event === USER_DOWN),
        map(({user}) => user)
    )

    const getRefreshDelay = googleTokens =>
        Math.max(0, googleTokens.accessTokenExpiryDate - Date.now() - REFRESH_IF_EXPIRES_IN_MINUTES * 60000)

    const getUser$ = username =>
        defer(() => from(userStore.getUser(username)))

    const setUser$ = user =>
        defer(() => from(userStore.setUser(user))).pipe(
            map(() => user)
        )

    const updateUser$ = user =>
        refreshGoogleAccessToken$(user).pipe(
            map(({body: googleTokens, statusCode}) => {
                if (statusCode !== 204) {
                    if (googleTokens) {
                        log.debug(`${userTag(user.username)} Google access token updated`)
                        return {...user, googleTokens: JSON.parse(googleTokens)}
                    } else {
                        log.warn(`${userTag(user.username)} Google access token missing`)
                        return null
                    }
                } else {
                    log.debug(`${userTag(user.username)} Google access token invalidated`)
                    return null
                }
            }),
            catchError(error => {
                log.warn(`${userTag(user.username)} Google access token update failed:`, error)
                return of(null)
            }),
            switchMap(updatedUser => updatedUser
                ? setUser$(updatedUser)
                : updateFailed$(user)
            )
        )
    
    const updateFailed$ = user =>
        revokeGoogleAccess$(user).pipe(
            switchMap(updatedUser => setUser$(updatedUser)),
            tap(() => {
                toUser$.next({
                    username: user.username,
                    event: {disconnectGoogleAccount: true}
                })
            })
        )

    const userRefresh$ = userConnected$.pipe(
        filter(({googleTokens}) => !!googleTokens),
        groupBy(({username}) => username),
        mergeMap(user$ => user$.pipe(
            switchMap(({username}) =>
                of(username).pipe(
                    switchMap(username =>
                        getUser$(username).pipe(
                            takeWhile(({googleTokens}) => googleTokens),
                            map(({username, googleTokens}) =>
                                ({username, refreshDelay: getRefreshDelay(googleTokens)})
                            ),
                            tap(({username, refreshDelay}) =>
                                log.debug(`${userTag(username)} Google access token refresh scheduled in ${refreshDelay} ms`)
                            ),
                            switchMap(({username, refreshDelay}) =>
                                timer(refreshDelay).pipe(
                                    switchMap(() => getUser$(username)),
                                    switchMap(user => updateUser$(user))
                                )
                            ),
                            repeat({delay: MIN_REFRESH_DELAY_MS}),
                            retry({delay: MIN_REFRESH_DELAY_MS})
                        )
                    ),
                    takeWhile(({googleTokens}) => googleTokens),
                    takeUntil(userDisconnected$.pipe(
                        filter(disconnectedUser => disconnectedUser.username === username),
                        tap(({username}) => log.debug(`${userTag(username)} Google access token refresh cancelled`))
                    ))
                )
            )
        ))
    )

    userRefresh$.subscribe({
        error: error => log.error('Unexpected userRefresh$ stream error', error),
        complete: () => log.error('Unexpected userRefresh$ stream closed')
    })
}

module.exports = {initializeGoogleAccessTokenRefresher}
