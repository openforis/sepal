const {groupBy, mergeMap, tap, takeUntil, filter, timer, switchMap, of, from, map, repeat, takeWhile, retry} = require('rxjs')
const {userTag} = require('./tag')
const {USER_UP, USER_DOWN} = require('./websocket-events')
const {updateGoogleAccessToken$, revokeGoogleAccess$} = require('./userApi')
const log = require('#sepal/log').getLogger('googleAccessToken')

const REFRESH_IF_EXPIRES_IN_MINUTES = 10
const MIN_REFRESH_DELAY_MS = 60 * 1000

const initializeGoogleAccessTokenRefresher = ({userStore, userStatus$, toUser$}) => {
    const userConnected$ = userStatus$.pipe(
        filter(({event}) => event === USER_UP),
        map(({user}) => user),
        tap(user => log.debug('connected user googleTokens', user.googleTokens))
    )

    const userDisconnected$ = userStatus$.pipe(
        filter(({event}) => event === USER_DOWN),
        map(({user}) => user)
    )

    const getRefreshDelay = googleTokens =>
        Math.max(0, googleTokens.accessTokenExpiryDate - Date.now() - REFRESH_IF_EXPIRES_IN_MINUTES * 60000)

    const getUser$ = username =>
        from(userStore.getUser(username))

    const setUser$ = user =>
        from(userStore.setUser(user)).pipe(
            map(() => user)
        )

    const updateUser$ = user =>
        updateGoogleAccessToken$(user).pipe(
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
                            tap(user => log.debug('stored user googleTokens', user.googleTokens)),
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
