const log = require('#sepal/log').getLogger('userStore')
const {usernameTag, userTag} = require('./tag')
const {catchError, from, switchMap, Subject, EMPTY, map, throwError, tap, of, firstValueFrom} = require('rxjs')
const {removeRequestUser} = require('./user')
const {getSessionUsername, setRequestUser} = require('./user')
const {loadUser$} = require('./userApi')

const SEPAL_USER_HEADER = 'sepal-user'
const USER_PREFIX = 'user'

const UserStore = redis => {
    if (!redis) {
        throw new Error('Cannot initialize UserStore due to missing argument: redis')
    }

    const userUpdate$ = new Subject()

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
        getUser$(user.username).pipe(
            switchMap(prevUser => from(redis.set(userKey(user.username), JSON.stringify(user))).pipe(
                switchMap(result =>
                    result === 'OK'
                        ? of(user)
                        : throwError(() => new Error(`${userTag(user?.username)} cannot be saved`, result))
                ),
                tap(user => log.debug(`${userTag(user?.username)} saved`)),
                tap(user => userUpdate$.next({prevUser, user}))
            ))
        )

    const removeUser$ = username =>
        from(redis.del(userKey(username))).pipe(
            map(result => result !== 0),
            tap(removed =>
                removed
                    ? log.debug(`${userTag(username)} removed`)
                    : log.warn(`${userTag(username)} not removed as missing`)
            )
        )
    
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
        getUser$, setUser$, removeUser$, updateUser$, userMiddleware, userUpdate$
    }
}

module.exports = {
    SEPAL_USER_HEADER,
    UserStore
}
