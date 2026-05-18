// Redis port for chat persistence. Wraps the per-user conversations
// store and the per-conversation history under one named port so the
// domain doesn't see "redis" or "ttlMs" — just conversationsFor /
// historyFor.

const {createRedisConversationsStore} = require('./redisConversationsStore')
const {createRedisHistory} = require('./redisHistory')

function createRedisChatStorage({redis, ttlMs}) {
    return {
        conversationsFor(username) {
            return createRedisConversationsStore({redis, username, ttlMs})
        },
        historyFor(username, conversationId) {
            return createRedisHistory({redis, username, conversationId, ttlMs})
        }
    }
}

module.exports = {createRedisChatStorage}
