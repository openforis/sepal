import _ from 'lodash'
import {catchError, defer, EMPTY, firstValueFrom, from, map, of, switchMap, tap, throwError} from 'rxjs'

import {GOOGLE_ACCESS_TOKEN_ADDED, GOOGLE_ACCESS_TOKEN_REMOVED, GOOGLE_ACCESS_TOKEN_UPDATED, USER_UPDATED} from '#sepal/event/definitions'
import {getLogger} from '#sepal/log'
import {applyKeyNormalization} from '#sepal/redisKeyCase'
import {isStoredUsername, storedUsername} from '#sepal/username'

import {usernameTag, userTag} from './tag.js'
import {getSessionUsername, removeRequestSession, removeRequestUser, setRequestUser} from './user.js'
import {loadUser$} from './userApi.js'

const log = getLogger('userStore')

const SEPAL_USER_HEADER = 'sepal-user'
const USER_PREFIX = 'user'

const UserStore = (redis, event$) => {
    if (!redis) {
        throw new Error('Cannot initialize UserStore due to missing argument: redis')
    }

    const userKey = username =>
        `${USER_PREFIX}:${storedUsername(username)}`

    // The cached user is keyed by the stored spelling and carries it too, so that the `sepal-user`
    // header this store feeds every other module names the user the same way the database does.
    const storedUser = user =>
        ({...user, username: storedUsername(user.username)})

    const getUser$ = username =>
        from(redis.get(userKey(username))).pipe(
            switchMap(serializedUser =>
                serializedUser
                    ? defer(() => of(JSON.parse(serializedUser))).pipe(
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
        from(redis.set(userKey(user.username), JSON.stringify(storedUser(user)), {GET: true})).pipe(
            map(prevUser => ({prevUser: JSON.parse(prevUser), user: storedUser(user)})),
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
        // Only api-key authentication puts this back.
        removeRequestSession(req)
        if (username) {
            firstValueFrom(getUser$(username))
                .then(user => {
                    setRequestUser(req, user)
                    next()
                })
                .catch(err => {
                    log.warn(`${usernameTag(username)} Cannot get user for injecting into request headers`, err)
                    next(err)
                })
        } else {
            next()
        }
    }

    const scanUserKeys = async () => {
        const keys = []
        for await (const batch of redis.scanIterator({MATCH: `${USER_PREFIX}:*`, COUNT: 1000})) {
            keys.push(...batch)
        }
        return keys
    }

    // Both halves of a cache entry can name the user in a spelling the database no longer holds: the
    // key, written before it was normalized here, and the username inside the value, copied verbatim
    // from whatever the backend returned. A key in any other spelling is unreachable — userKey()
    // normalizes every lookup — so it is dropped rather than renamed, while a reachable entry keeps
    // its value and has only the username corrected.
    //
    // The correction deliberately bypasses setUser$: that publishes USER_UPDATED and the Google token
    // events on every change, which at startup would mean thousands of events describing no change at
    // all. Nothing here alters what a user IS, only how the store spells them.
    const normalizeCase = async () => {
        const {removed} = await applyKeyNormalization(await scanUserKeys(), {
            prefix: USER_PREFIX,
            orphans: 'remove',
            removeKeys: keys => redis.del(keys)
        })

        let corrected = 0
        for (const keys of _.chunk(await scanUserKeys(), 500)) {
            const users = await redis.mGet(keys)
            for (const [index, key] of keys.entries()) {
                const user = parseUser(key, users[index])
                if (user && !isStoredUsername(user.username)) {
                    await redis.set(key, JSON.stringify(storedUser(user)), {KEEPTTL: true})
                    corrected++
                }
            }
        }

        log.info(`Normalized user cache: ${removed} unreachable key(s) removed, ${corrected} username(s) corrected`)
        return {removed, corrected}
    }

    const parseUser = (key, serializedUser) => {
        try {
            return serializedUser ? JSON.parse(serializedUser) : null
        } catch (error) {
            log.warn(`Cannot deserialize ${key}, leaving it untouched`, error)
            return null
        }
    }

    return {
        getUser$, normalizeCase, setUser$, updateUser$, userMiddleware
    }
}

export {
    SEPAL_USER_HEADER,
    UserStore
}
