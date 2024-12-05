const {Subject, groupBy, mergeMap, tap, takeUntil, filter, timer, switchMap, of, from, map, scan, mergeWith, share} = require('rxjs')
const _ = require('lodash')
const {userTag} = require('./tag')
const modules = require('../config/modules')
const {postJson$} = require('sepal/src/httpClient')
const {SEPAL_USER_HEADER} = require('./user')
const log = require('#sepal/log').getLogger('googleAccessToken')

const GOOGLE_ACCESS_TOKEN_REFRESH_URL = `http://${modules.user}/google/refresh-access-token`
const REFRESH_IF_EXPIRES_IN_MINUTES = 10

const GoogleAccessTokenRefresher = userStore => {
    const user$ = new Subject()
    const userRefreshed$ = new Subject()

    const userStatus$ = user$.pipe(
        groupBy(({username}) => username),
        mergeMap(user$ => user$.pipe(
            scan(({count}, {user, delta}) => ({
                user,
                count: count + delta,
                connected: count === 0 && delta === 1,
                disconnected: count === 1 && delta === -1,
            }), {
                count: 0,
                connected: false,
                disconnected: false
            })
        )),
        share()
    )

    const userConnected$ = userStatus$.pipe(
        filter(({connected}) => connected === true),
        map(({user}) => user)
    )

    const userDisconnected$ = userStatus$.pipe(
        filter(({disconnected}) => disconnected === true),
        map(({user}) => user)
    )

    userConnected$.pipe(
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
    ).subscribe({
        next: user => userRefreshed$.next(user),
        error: error => log.error('Unexpected userAuthenticated$ stream error', error),
        complete: () => log.error('Unexpected userAuthenticated$ stream closed')
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
        user$.next({user, delta: 1})
    
    const userDisconnected = user =>
        user$.next({user, delta: -1})

    return {userConnected, userDisconnected}
}

module.exports = {GoogleAccessTokenRefresher}
