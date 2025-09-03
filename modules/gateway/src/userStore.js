const _ = require('lodash')
const log = require('#sepal/log').getLogger('userStore')
const {usernameTag, userTag} = require('./tag')
const {catchError, from, switchMap, EMPTY, throwError, map, tap, of, firstValueFrom} = require('rxjs')
const {removeRequestUser} = require('./user')
const {getSessionUsername, setRequestUser} = require('./user')
const {loadUser$} = require('./userApi')
const {USER_UPDATED, GOOGLE_ACCESS_TOKEN_ADDED, GOOGLE_ACCESS_TOKEN_REMOVED, GOOGLE_ACCESS_TOKEN_UPDATED} = require('./websocket-events')

const SEPAL_USER_HEADER = 'sepal-user'
const USER_PREFIX = 'user'

const UserStore = (redis, event$) => {
    if (!redis) {
        throw new Error('Cannot initialize UserStore due to missing argument: redis')
    }

    const userKey = username =>
        `${USER_PREFIX}:${username.toLowerCase()}`

    const getUser$ = username =>
        from(redis.get(userKey(username))).pipe(
            switchMap(serializedUser =>
                serializedUser
                    ? of(JSON.parse(serializedUser)).pipe(
                        tap(() => log.debug(`${userTag(username)} retrieved`)),
                        catchError(error =>
                            throwError(() => new Error(`${userTag(username)} could not be deserialized`, {cause: error}))
                        )
                    )
                    : loadUser$(username).pipe(
                        tap(() => log.debug(`${userTag(username)} not in store, loaded from backend`)),
                        catchError(error =>
                            throwError(() => new Error(`${userTag(username)} not in store, could not be loaded from backend`, {cause: error}))
                        ),
                        switchMap(user => setUser$(user))
                    )
            )
        )

    const setUser$ = user =>
        from(redis.set(userKey(user.username), JSON.stringify(user), {GET: true})).pipe(
            map(prevUser => ({prevUser: JSON.parse(prevUser), user})),
            catchError(cause =>
                throwError(() => new Error(`${userTag(user?.username)} cannot be saved`, {cause}))
            ),
            tap(({prevUser, user}) => handleUpdate(prevUser, user)),
            map(({user}) => user),
            tap(user => log.debug(`${userTag(user?.username)} saved`)),
        )

    const handleUpdate = (prevUser, user) => {
        if (!_.isEqual(prevUser, user)) {
            log.debug(`${userTag(user.username)} updated`)
            event$.next({type: USER_UPDATED, data: {user}})
            if (!prevUser?.googleTokens && user.googleTokens) {
                event$.next({type: GOOGLE_ACCESS_TOKEN_ADDED, data: {user}})
            } else if (prevUser?.googleTokens && !user.googleTokens) {
                event$.next({type: GOOGLE_ACCESS_TOKEN_REMOVED, data: {user}})
            } else if (!_.isEqual(prevUser?.googleTokens, user.googleTokens)) {
                event$.next({type: GOOGLE_ACCESS_TOKEN_UPDATED, data: {user}})
            }
        }
    }

    const updateUser$ = username => {
        if (username) {
            log.debug(`${userTag(username)} updating...`)
            return loadUser$(username).pipe(
                switchMap(user => {
                    log.debug(`${userTag(user.username)} updated, ${user.googleTokens ? 'connected to Google' : 'disconnected from Google'}`)
                    return setUser$(user)
                }),
                catchError(error => {
                    log.warn(`${userTag(username)} could not be updated`, error)
                    return EMPTY
                })
            )
        } else {
            log.warn('No user to update')
            return EMPTY
        }
    }

    const userMiddleware = (req, res, next) => {
        const username = getSessionUsername(req)
        removeRequestUser(req)
        if (username) {
            firstValueFrom(getUser$(username))
                .then(user => {
                    setRequestUser(req, user)
                    next()
                })
                .catch(err => {
                    log.warn(`${usernameTag(username)} Cannot get user for injecting into request headers`, err)
                    next()
                })
        } else {
            next()
        }
    }

    return {
        getUser$, setUser$, updateUser$, userMiddleware
    }
}

module.exports = {
    SEPAL_USER_HEADER,
    UserStore
}
