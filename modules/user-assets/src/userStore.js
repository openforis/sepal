import {getLogger} from '#sepal/log'
import {applyKeyNormalization} from '#sepal/redisKeyCase'
import {isStoredUsername, storedUsername} from '#sepal/username'

import {deserialize, redis, scanKeys, serialize} from './redis.js'
import {userTag} from './tag.js'

const log = getLogger('userStore')

const USER_PREFIX = 'user'

const userKey = username =>
    `${USER_PREFIX}:${storedUsername(username)}`

const storedUser = user =>
    ({...user, username: storedUsername(user.username)})

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
    await redis.set(userKey(user.username), serialize(storedUser(user)))
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

// Both the key and the username inside the cached user can hold a spelling the database no longer
// uses. The key is renamed rather than dropped — it is the only copy of that user's cached state —
// and every surviving value then has its username corrected, renamed keys included.
const normalizeCase = async () => {
    const {removed, renamed} = await applyKeyNormalization(await scanKeys(`${USER_PREFIX}:*`), {
        prefix: USER_PREFIX,
        renameKey: async (from, to) => await redis.renamenx(from, to) === 1,
        removeKeys: keys => redis.del(keys)
    })

    let corrected = 0
    for (const key of await scanKeys(`${USER_PREFIX}:*`)) {
        const user = deserialize(await redis.get(key))
        if (user && !isStoredUsername(user.username)) {
            await redis.set(key, serialize(storedUser(user)))
            corrected++
        }
    }

    if (removed || renamed || corrected) {
        log.info(`Normalized users: ${removed} duplicate(s) removed, ${renamed} renamed, ${corrected} username(s) corrected`)
    }
}

export {getUser, isConnectedWithGoogle, normalizeCase, removeUser, setUser}
