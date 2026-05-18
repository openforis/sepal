// Redis adapter for one conversation's message history, stored as a
// list and expiring as a whole via ttlMs.

const {defer, from, map, concatMap} = require('rxjs')
const {historyKey, ttlSeconds} = require('./redisKeys')

function createRedisHistory({redis, username, conversationId, ttlMs}) {
    const key = historyKey(username, conversationId)
    const seconds = ttlSeconds(ttlMs)

    return {append$, load$, clear$}

    function append$(message) {
        return defer(() => from(redis.rpush(key, JSON.stringify(message)))).pipe(
            concatMap(() => expire$()),
            map(() => undefined)
        )
    }

    function load$() {
        return defer(() => from(redis.lrange(key, 0, -1))).pipe(
            map(messages => messages.map(JSON.parse))
        )
    }

    function clear$() {
        return defer(() => from(redis.del(key))).pipe(
            map(() => undefined)
        )
    }

    function expire$() {
        return from(redis.expire(key, seconds))
    }
}

module.exports = {createRedisHistory}
