const {formatDistanceToNowStrict} = require('date-fns')

const {redis, deserialize, serialize} = require('./redis')
const {userTag} = require('./tag')

const log = require('#sepal/log').getLogger('assetStore')

const assetsKey = username =>
    `assets:${username}`

const setAssets = async (username, assets, {expire} = {}) => {
    log.trace(`${userTag(username)} save assets`)
    await redis.set(assetsKey(username), serialize({assets, timestamp: expire ? null : Date.now()}))
        .then(result => result === 'OK')
        .then(saved => {
            if (saved) {
                log.isTrace()
                    ? log.trace(`${userTag(username)} assets saved:`, assets)
                    : log.debug(`${userTag(username)} assets saved`)
            } else {
                log.isTrace()
                    ? log.warn(`${userTag(username)} could not save assets:`, assets)
                    : log.warn(`${userTag(username)} could not save assets`)
            }
            return saved
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
        return await setAssets(username, assets, {expire: true})
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

module.exports = {setAssets, getAssets, expireAssets, removeAssets}
