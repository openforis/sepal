const {groupBy, mergeMap, tap, takeUntil, filter, timer, switchMap, defer, from, map, repeat, takeWhile, take, finalize, exhaustMap, of, catchError} = require('rxjs')
const {userTag} = require('./tag')
const {USER_UP, USER_DOWN} = require('./websocket-events')
const {updateGoogleAccessToken$, revokeGoogleAccess$} = require('./userApi')
const log = require('#sepal/log').getLogger('googleAccessToken')
const {formatDistanceStrict} = require('date-fns')
const {autoRetry} = require('sepal/src/rxjs')

const REFRESH_IF_EXPIRES_IN_MINUTES = 10
const MIN_RETRY_DELAY_MS = 2000

const initializeGoogleAccessTokenRefresher = ({userStore, userStatus$, toUser$}) => {

    const getUser$ = username =>
        from(userStore.getUser(username))

    const setUser$ = user =>
        from(userStore.setUser(user)).pipe(
            map(() => user)
        )

    const userConnected$ = userStatus$.pipe(
        filter(({event}) => event === USER_UP),
        map(({user}) => user),
        filter(({googleTokens}) => !!googleTokens),
        tap(({username, googleTokens}) => {
            const googleAccessTokenValid = googleTokens.accessTokenExpiryDate > Date.now()
            return log.debug(`${userTag(username)} connected with ${googleAccessTokenValid ? 'valid' : 'expired'} Google access token`)
        })
    )

    const userDisconnected$ = userStatus$.pipe(
        filter(({event}) => event === USER_DOWN),
        map(({user}) => user)
    )

    const currentUserDisconnected$ = username =>
        userDisconnected$.pipe(
            filter(user => user.username === username),
        )

    const refreshDelay$ = username =>
        getUser$(username).pipe(
            map(({googleTokens}) =>
                Math.max(0, googleTokens.accessTokenExpiryDate - Date.now() - REFRESH_IF_EXPIRES_IN_MINUTES * 60000)
            )
        )

    const refreshTrigger$ = username =>
        refreshDelay$(username).pipe(
            tap(delay => log.debug(`${userTag(username)} Google access token refresh in ${formatDistanceStrict(0, delay)}`)),
            switchMap(delay => timer(delay))
        )
        
    const updateUser$ = user =>
        updateGoogleAccessToken$(user).pipe(
            switchMap(updatedUser => updatedUser
                ? setUser$(updatedUser)
                : updateFailed$(user)
            )
        )

    const disconnectUser = username =>
        toUser$.next({username, event: {disconnectGoogleAccount: true}})

    const updateFailed$ = user =>
        revokeGoogleAccess$(user).pipe(
            switchMap(updatedUser => setUser$(updatedUser)),
            tap(() => disconnectUser(user.username))
        )

    const refresh$ = username =>
        of(username).pipe(
            tap(() => log.debug(`${userTag(username)} Google access token refreshing now`)),
            exhaustMap(() => getUser$(username).pipe(
                switchMap(user => updateUser$(user))
            )),
            autoRetry({
                maxRetries: 3,
                minRetryDelay: MIN_RETRY_DELAY_MS,
                retryDelayFactor: 2,
                onRetry: (_error, retryMessage) => log.debug(`${userTag(username)} Google access token refresh error - ${retryMessage}`)
            }),
            catchError(error => {
                log.warn(`${userTag(username)} Google access token refresh error`, error)
                return getUser$(username).pipe(
                    switchMap(({googleTokens: _googleTokens, ...user}) => setUser$(user)),
                    tap(() => disconnectUser(username))
                )
            })
        )

    userConnected$.pipe(
        groupBy(({username}) => username),
        mergeMap(userGroup$ => userGroup$.pipe(
            tap(() => log.debug(`${userTag(userGroup$.key)} monitoring Google access token`)),
            exhaustMap(({username}) =>
                defer(() => refreshTrigger$(username)).pipe(
                    switchMap(() => refresh$(username)),
                    take(1),
                    repeat({delay: 0}),
                    takeWhile(({googleTokens}) => !!googleTokens),
                    takeUntil(currentUserDisconnected$(username)),
                    finalize(() => log.debug(`${userTag(username)} unmonitoring Google access token`))
                )
            )
        ))
    ).subscribe({
        error: error => log.error('Unexpected Google access token refresh stream error', error),
        complete: () => log.error('Unexpected Google access token refresh stream closed')
    })
}

module.exports = {initializeGoogleAccessTokenRefresher}
