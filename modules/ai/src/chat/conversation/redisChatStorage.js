// Redis port for chat persistence. Exposes conversationsFor(username)
// and historyFor(username, conversationId).

import {createRedisConversationsStore} from './redisConversationsStore.js'
import {createRedisHistory} from './redisHistory.js'

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

export {createRedisChatStorage}
