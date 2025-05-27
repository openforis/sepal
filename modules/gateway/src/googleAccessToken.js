const {groupBy, mergeMap, tap, takeUntil, filter, timer, switchMap, defer, map, repeat, takeWhile, take, finalize, exhaustMap, share} = require('rxjs')
const {userTag} = require('./tag')
const {USER_UP, USER_DOWN, GOOGLE_ACCESS_TOKEN_UPDATED, GOOGLE_ACCESS_TOKEN_ADDED, GOOGLE_ACCESS_TOKEN_REMOVED} = require('./websocket-events')
const {updateGoogleAccessToken$} = require('./userApi')
const log = require('#sepal/log').getLogger('googleAccessToken')
const {formatDistanceStrict} = require('date-fns')
const {autoRetry} = require('sepal/src/rxjs')

const REFRESH_IF_EXPIRES_IN_MINUTES = 10
const MIN_RETRY_DELAY_MS = 2 * 1000 // 2 seconds
const MAX_RETRY_DELAY_MS = 10 * 60 * 1000 // 10 minutes

const getRefreshDelay = googleTokens =>
    Math.max(0, googleTokens.accessTokenExpiryDate - Date.now() - REFRESH_IF_EXPIRES_IN_MINUTES * 60000)

const isRefreshRequired = googleTokens =>
    getRefreshDelay(googleTokens) === 0

const initializeGoogleAccessTokenRefresher = ({userStore, event$}) => {

    const monitor$ = event$.pipe(
        filter(({type}) => [USER_UP, GOOGLE_ACCESS_TOKEN_ADDED, GOOGLE_ACCESS_TOKEN_UPDATED].includes(type)),
        map(({data: {user}}) => user),
        filter(({googleTokens}) => !!googleTokens),
        tap(({username, googleTokens}) => {
            const googleAccessTokenValid = googleTokens.accessTokenExpiryDate > Date.now()
            return log.debug(`${userTag(username)} connected with ${googleAccessTokenValid ? 'valid' : 'expired'} Google access token`)
        })
    )

    const unmonitor$ = event$.pipe(
        filter(({type}) => [USER_DOWN, GOOGLE_ACCESS_TOKEN_REMOVED].includes(type)),
        map(({data: {user}}) => user),
        share()
    )

    const currentUserDisconnected$ = username =>
        unmonitor$.pipe(
            filter(user => user.username === username)
        )

    const refreshDelay$ = username =>
        userStore.getUser$(username).pipe(
            map(({googleTokens}) => getRefreshDelay(googleTokens))
        )

    const refreshTrigger$ = username =>
        refreshDelay$(username).pipe(
            tap(delay => log.debug(`${userTag(username)} Google access token refresh in ${formatDistanceStrict(0, delay)}`)),
            switchMap(delay => timer(delay))
        )

    const refresh$ = username =>
        userStore.getUser$(username).pipe(
            tap(() => log.debug(`${userTag(username)} Google access token refreshing now`)),
            switchMap(user => updateGoogleAccessToken$(user)),
            switchMap(updatedUser => userStore.setUser$(updatedUser))
        )

    monitor$.pipe(
        filter(({username}) => username),
        groupBy(({username}) => username),
        mergeMap(userGroup$ => userGroup$.pipe(
            tap(() => log.info(`${userTag(userGroup$.key)} Google access token monitored`)),
            exhaustMap(({username}) =>
                defer(() => refreshTrigger$(username)).pipe(
                    // warning: order of operators matters!
                    switchMap(() => refresh$(username)),
                    tap(() => log.debug(`${userTag(username)} Google access token refreshed`)),
                    take(1),
                    repeat({delay: 1000}),
                    takeWhile(({googleTokens}) => !!googleTokens),
                    takeUntil(currentUserDisconnected$(username)),
                    autoRetry({
                        maxRetries: -1,
                        minRetryDelay: MIN_RETRY_DELAY_MS,
                        maxRetryDelay: MAX_RETRY_DELAY_MS,
                        retryDelayFactor: 2,
                        onRetry: (error, retryMessage) => log.warn(`${userTag(username)} Google access token refresh error - ${retryMessage}`, error)
                    }),
                    finalize(() => log.info(`${userTag(username)} Google access token unmonitored`))
                )
            )
        ))
    ).subscribe({
        error: error => log.error('Unexpected Google access token refresh stream error', error),
        complete: () => log.error('Unexpected Google access token refresh stream closed')
    })
}

module.exports = {initializeGoogleAccessTokenRefresher, isRefreshRequired}
