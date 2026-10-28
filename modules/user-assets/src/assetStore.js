import {formatDistanceToNowStrict} from 'date-fns'

import {getLogger} from '#sepal/log'
import {applyKeyNormalization} from '#sepal/redisKeyCase'
import {storedUsername} from '#sepal/username'

import {deserialize, redis, scanKeys, serialize} from './redis.js'
import {userTag} from './tag.js'

const log = getLogger('assetStore')

const ASSETS_PREFIX = 'assets'

const assetsKey = username =>
    `${ASSETS_PREFIX}:${storedUsername(username)}`

const setAssets = async (username, assets, {expire} = {}) => {
    log.trace(`${userTag(username)} save assets`)
    await redis.set(assetsKey(username), serialize({assets, timestamp: expire ? null : Date.now()}))
        .then(() => {
            log.isTrace()
                ? log.trace(`${userTag(username)} assets saved:`, assets)
                : log.debug(`${userTag(username)} assets saved`)
        })
        .catch(error => {
            log.error(`${userTag(username)} error saving assets:`, error)
            throw error
        })
}

const getAssets = async (username, {allowMissing} = {}) => {
    log.trace(`${userTag(username)} retrieve assets`)
    return await redis.get(assetsKey(username))
        .then(serializedAssets => {
            const result = deserialize(serializedAssets)
            if (result) {
                const {assets, timestamp} = result
                log.isTrace()
                    ? log.trace(`${userTag(username)} retrieved assets:`, assets)
                    : log.debug(`${userTag(username)} retrieved assets, ${timestamp ? `age ${formatDistanceToNowStrict(timestamp)}` : 'expired'}`)
                return {assets, timestamp}
            } else {
                if (allowMissing) {
                    log.debug(`${userTag(username)} assets not found`)
                } else {
                    log.warn(`${userTag(username)} assets not found`)
                }
                return {}
            }
        })
}

const expireAssets = async username => {
    const {assets} = await getAssets(username, {allowMissing: true})
    if (assets) {
        log.trace(`${userTag(username)} expire assets`)
        await setAssets(username, assets, {expire: true})
    }
}

const removeAssets = async (username, {allowMissing} = {}) => {
    log.trace(`${userTag(username)} remove assets`)
    await redis.del(assetsKey(username))
        .then(result => result !== 0)
        .then(removed => {
            if (removed) {
                log.debug(`${userTag(username)} assets removed`)
            } else {
                if (allowMissing) {
                    log.debug(`${userTag(username)} assets not removed as missing`)
                } else {
                    log.warn(`${userTag(username)} could not remove assets`)
                }
            }
            return removed
        })
}

// Only the key names the user here: the value holds the asset tree, whose `users/<account>` paths
// are Earth Engine accounts rather than SEPAL usernames and must keep the case they were fetched in.
const normalizeCase = async () => {
    const {removed, renamed} = await applyKeyNormalization(await scanKeys(`${ASSETS_PREFIX}:*`), {
        prefix: ASSETS_PREFIX,
        renameKey: async (from, to) => await redis.renamenx(from, to) === 1,
        removeKeys: keys => redis.del(keys)
    })

    log.info(`Normalized assets: ${removed} duplicate(s) removed, ${renamed} renamed`)
}

export {expireAssets, getAssets, normalizeCase, removeAssets, setAssets}
