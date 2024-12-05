const log = require('#sepal/log').getLogger('userstore')
const _ = require('lodash')
const {usernameTag, urlTag} = require('./tag')
const {EMPTY, from, map, switchMap, firstValueFrom, catchError} = require('rxjs')
const {get$} = require('#sepal/httpClient')
const modules = require('../config/modules')
const {deserialize, serialize} = require('./user')
const {getRequestUser, getSessionUsername, setRequestUser} = require('./user')

const SEPAL_USER_HEADER = 'sepal-user'
const USER_PREFIX = 'user'

const currentUserUrl = `http://${modules.user}/current`

const UserStore = redis => {
    if (!redis) {
        throw new Error('Cannot initialize UserStore due to missing argument: redis')
    }

    const userKey = username =>
        `${USER_PREFIX}:${username.toLowerCase()}`

    const getUser = async username =>
        await redis.get(userKey(username))
            .then(serializedUser => {
                const user = deserialize(serializedUser)
                log.isTrace() && log.trace(`${usernameTag(username)} User retrieved from store:`, user)
                return user
            })

    const setUser = async user =>
        await redis.set(userKey(user.username), serialize(user))
            .then(result => result === 'OK')
            .then(saved => {
                if (saved) {
                    log.isTrace() && log.trace(`${usernameTag(user.username)} User saved into store:`, user)
                } else {
                    log.isTrace() && log.trace(`${usernameTag(user.username)} Could not save user into store`)
                }
                return saved
            })
    
    const removeUser = async username =>
        await redis.del(userKey(username))
            .then(result => result !== 0)
            .then(removed => {
                if (removed) {
                    log.isTrace() && log.trace(`${usernameTag(username)} User removed from store:`)
                } else {
                    log.isTrace() && log.trace(`${usernameTag(username)} Could not remove user from store`)
                }
                return removed
            })
    
    const updateUser = async req => {
        const user = getRequestUser(req)
        if (user) {
            log.isTrace() && log.trace(`${usernameTag(user.username)} ${urlTag(req.url)} Updating user in user store`)
            await firstValueFrom(
                get$(currentUserUrl, {
                    headers: {[SEPAL_USER_HEADER]: JSON.stringify(user)}
                }).pipe(
                    map((({body}) => JSON.parse(body))),
                    switchMap(user => {
                        log.isDebug() && log.debug(`${usernameTag(user.username)} ${urlTag(req.url)} Updated user in user store, connected to Google: ${!!user.googleTokens}`)
                        return from(setUser(user))
                    }),
                    catchError(error => {
                        log.error(`${usernameTag(user.username)} ${urlTag(req.url)} Failed to load current user`, error)
                        return EMPTY
                    })
                )
            )
        } else {
            log.warn('[not-authenticated] Updated user, but no user in user store')
        }
    }

    const userMiddleware = (req, res, next) => {
        const username = getSessionUsername(req)
        if (username) {
            getUser(username)
                .then(user => {
                    if (user) {
                        setRequestUser(req, user)
                    } else {
                        log.warn(`${usernameTag(username)} Cannot inject user into request headers`)
                    }
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
        getUser, setUser, removeUser, updateUser, userMiddleware
    }
}

module.exports = {
    SEPAL_USER_HEADER,
    UserStore
}
