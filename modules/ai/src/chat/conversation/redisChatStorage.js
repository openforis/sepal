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
