const log = require('#sepal/log').getLogger('userStore')
const {usernameTag, userTag} = require('./tag')
const {from, map, switchMap, firstValueFrom, Subject} = require('rxjs')
const {get$} = require('#sepal/httpClient')
const modules = require('../config/modules')
const {deserialize, serialize, removeRequestUser} = require('./user')
const {getRequestUser, getSessionUsername, setRequestUser} = require('./user')

const SEPAL_USER_HEADER = 'sepal-user'
const USER_PREFIX = 'user'

const currentUserUrl = `http://${modules.user}/current`

const UserStore = redis => {
    if (!redis) {
        throw new Error('Cannot initialize UserStore due to missing argument: redis')
    }

    const userUpdate$ = new Subject()

    const userKey = username =>
        `${USER_PREFIX}:${username.toLowerCase()}`

    const getUser = async username => {
        log.trace(`${userTag(username)} retrieve`)
        return await redis.get(userKey(username))
            .then(serializedUser => {
                const user = deserialize(serializedUser)
                log.trace(`${userTag(username)} retrieved`)
                return user
            })
    }

    const setUser = async user => {
        log.trace(`${userTag(user.username)} saving`, user.googleTokens)
        return await redis.set(userKey(user.username), serialize(user))
            .then(result => {
                if (result === 'OK') {
                    log.isTrace()
                        ? log.trace(`${userTag(user.username)} saved:`, user)
                        : log.debug(`${userTag(user.username)} saved`)
                    userUpdate$.next(user)
                    return true
                } else {
                    throw new Error(`${usernameTag(user.username)} Could not save user into store`, result)
                }
            })
    }
    
    const removeUser = async username => {
        log.trace(`${userTag(username)} remove`)
        return await redis.del(userKey(username))
            .then(result => result !== 0)
            .then(removed => {
                if (removed) {
                    log.debug(`${userTag(username)} removed`)
                } else {
                    log.debug(`${userTag(username)} not removed as missing`)
                }
                return removed
            })
    }
    
    const updateUser = async req => {
        const user = getRequestUser(req)
        if (user) {
            log.debug(`${userTag(user.username)} updating`, user.googleTokens)
            await firstValueFrom(
                get$(currentUserUrl, {
                    headers: {[SEPAL_USER_HEADER]: JSON.stringify(user)}
                }).pipe(
                    map((({body}) => JSON.parse(body))),
                    switchMap(user => {
                        log.debug(`${userTag(user.username)} updated, ${user.googleTokens ? 'connected to Google' : 'disconnected from Google'}`)
                        return from(setUser(user))
                    })
                )
            )
        } else {
            log.warn('No user to update')
        }
    }

    const userMiddleware = (req, res, next) => {
        const username = getSessionUsername(req)
        removeRequestUser(req)
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
        getUser, setUser, removeUser, updateUser, userMiddleware, userUpdate$
    }
}

module.exports = {
    SEPAL_USER_HEADER,
    UserStore
}
