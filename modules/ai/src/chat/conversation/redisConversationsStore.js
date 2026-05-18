// Redis adapter for one user's conversation metadata (id, title,
// timestamps), stored as a hash and expiring as a whole via ttlMs.

const {defer, from, map, concatMap, of} = require('rxjs')
const {conversationsKey, historyKey, ttlSeconds} = require('./redisKeys')

function createRedisConversationsStore({redis, username, ttlMs}) {
    const key = conversationsKey(username)
    const seconds = ttlSeconds(ttlMs)

    return {add$, get$, touch$, updateTitle$, delete$, list$}

    function add$(meta) {
        return defer(() => from(redis.hset(key, meta.id, JSON.stringify(meta)))).pipe(
            concatMap(() => expire$()),
            map(() => undefined)
        )
    }

    function get$(id) {
        return defer(() => from(redis.hget(key, id))).pipe(
            map(parseMeta)
        )
    }

    function touch$(id, updatedAt) {
        return get$(id).pipe(
            concatMap(meta => {
                if (!meta) return of(false)
                return add$({...meta, updatedAt}).pipe(map(() => true))
            })
        )
    }

    function updateTitle$(id, title) {
        return get$(id).pipe(
            concatMap(meta => {
                if (!meta) return of(false)
                return add$({...meta, title}).pipe(map(() => true))
            })
        )
    }

    function delete$(id) {
        return defer(() => from(redis.hdel(key, id))).pipe(
            concatMap(removed => from(redis.del(historyKey(username, id))).pipe(
                map(() => removed > 0)
            ))
        )
    }

    function list$() {
        return defer(() => from(redis.hvals(key))).pipe(
            map(values => values.map(parseMeta).filter(Boolean).sort(mostRecentFirst))
        )
    }

    function expire$() {
        return from(redis.expire(key, seconds))
    }
}

function parseMeta(value) {
    return value ? JSON.parse(value) : undefined
}

function mostRecentFirst(a, b) {
    return b.updatedAt.localeCompare(a.updatedAt)
}

module.exports = {createRedisConversationsStore}
