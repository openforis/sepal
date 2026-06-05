import {redis, deserialize, serialize} from './redis.js'
import {userTag} from './tag.js'

import {getLogger} from '#sepal/log'
const log = getLogger('userStore')

const userKey = username =>
    `user:${username}`

const getUser = async (username, {allowMissing} = {}) => {
    log.trace(`${userTag(username)} retrieve`)
    return await redis.get(userKey(username))
        .then(serializedUser => {
            const user = deserialize(serializedUser)
            if (user) {
                log.isTrace()
                    ? log.trace(`${userTag(username)} retrieved:`, user)
                    : log.debug(`${userTag(username)} retrieved`)
            } else {
                if (allowMissing) {
                    log.debug(`${userTag(username)} not found`)
                } else {
                    log.warn(`${userTag(username)} not found`)
                }
            }
            return user
        })
}

const setUser = async user => {
    log.trace(`${userTag(user.username)} save`)
    await redis.set(userKey(user.username), serialize(user))
        .then(() => {
            log.isTrace()
                ? log.trace(`${userTag(user.username)} saved:`, user)
                : log.debug(`${userTag(user.username)} saved`)
        })
        .catch(error => {
            log.error(`${userTag(user.username)} could not save:`, error)
            throw error
        })
}

const removeUser = async username => {
    log.trace(`${userTag(username)} remove`)
    await redis.del(userKey(username))
        .then(result => result !== 0)
        .then(removed => {
            if (removed) {
                log.debug(`${userTag(username)} removed`)
            } else {
                log.debug(`${userTag(username)} not removed as missing`)
            }
            return removed
        })
        .catch(error => {
            log.error(`${userTag(username)} could not remove`, error)
            throw error
        })
}

const isConnectedWithGoogle = user =>
    !!user.googleTokens

export {getUser, setUser, removeUser, isConnectedWithGoogle}
