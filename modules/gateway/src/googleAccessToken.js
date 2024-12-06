const {Subject, groupBy, mergeMap, tap, takeUntil, filter, timer, switchMap, of, from, map, mergeWith} = require('rxjs')
const {userTag} = require('./tag')
const modules = require('../config/modules')
const {postJson$} = require('sepal/src/httpClient')
const {SEPAL_USER_HEADER} = require('./user')
const log = require('#sepal/log').getLogger('googleAccessToken')

const GOOGLE_ACCESS_TOKEN_REFRESH_URL = `http://${modules.user}/google/refresh-access-token`
const REFRESH_IF_EXPIRES_IN_MINUTES = 10

const GoogleAccessTokenRefresher = userStore => {
    const userConnected$ = new Subject()
    const userDisconnected$ = new Subject()
    const userRefreshed$ = new Subject()

    const userRefresh$ = userConnected$.pipe(
        mergeWith(userRefreshed$),
        filter(({googleTokens}) => !!googleTokens),
        groupBy(({username}) => username),
        mergeMap(user$ => user$.pipe(
            map(user => ({user, refreshDelay: getRefreshDelay(user)})),
            tap(({user: {username}, refreshDelay}) =>
                log.info(`${userTag(username)} Google access token refresh scheduled in ${refreshDelay} ms`)
            ),
            switchMap(({user, refreshDelay}) =>
                timer(refreshDelay).pipe(
                    switchMap(() => refresh$(user)),
                    takeUntil(userDisconnected$.pipe(
                        filter(({username}) => username === user.username),
                        tap(({username}) => log.debug(`${userTag(username)} disconnected`))
                    ))
                )
            )
        ))
    )

    userRefresh$.subscribe({
        next: user => userRefreshed$.next(user),
        error: error => log.error('Unexpected userRefresh$ stream error', error),
        complete: () => log.error('Unexpected userRefresh$ stream closed')
    })

    const getRefreshDelay = ({googleTokens}) =>
        Math.max(0, googleTokens.accessTokenExpiryDate - Date.now() - REFRESH_IF_EXPIRES_IN_MINUTES * 60000)
    
    const refresh$ = user =>
        of(user).pipe(
            tap(({username}) => log.debug(`${userTag(username)} Google access token refreshing`)),
            switchMap(user =>
                postJson$(GOOGLE_ACCESS_TOKEN_REFRESH_URL, {
                    headers: {
                        [SEPAL_USER_HEADER]: JSON.stringify(user)
                    }
                })
            ),
            switchMap(({body: googleTokens}) =>
                from(getUpdatedUser(user, googleTokens))
            )
        )
        
    const getUpdatedUser = async (user, googleTokens) => {
        if (googleTokens) {
            const updatedUser = {...user, googleTokens: JSON.parse(googleTokens)}
            await userStore.setUser(updatedUser)
            log.info(`${userTag(user.username)} Google access token refreshed`)
            return updatedUser
        } else {
            log.info(`${userTag(user.username)} Google access token missing`)
            return user
        }
    }
    
    const userConnected = user =>
        userConnected$.next(user)
    
    const userDisconnected = user =>
        userDisconnected$.next(user)

    return {userConnected, userDisconnected}
}

module.exports = {GoogleAccessTokenRefresher}
