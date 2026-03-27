const {Redis} = require('ioredis')
const {v4: uuid} = require('uuid')
const log = require('#sepal/log').getLogger('conversationStore')

const getMetaKey = (username, id) => `conv:${username}:${id}:meta`
const getMessagesKey = (username, id) => `conv:${username}:${id}:messages`
const getIndexKey = username => `conv:${username}:index`

const createConversationStore = ({redisHost, ttlMs}) => {
    const ttlSeconds = Math.round(ttlMs / 1000)
    const redis = new Redis({host: redisHost, db: 0})

    redis.on('error', error => log.error('Redis error:', error))
    redis.on('connect', () => log.info('Connected to Redis'))

    const createConversation = async ({username, id = uuid()}) => {
        const now = new Date()
        const meta = {title: '', createdAt: now.toISOString(), updatedAt: now.toISOString()}
        const metaKey = getMetaKey(username, id)
        await redis.set(metaKey, JSON.stringify(meta), 'EX', ttlSeconds)
        await redis.zadd(getIndexKey(username), now.getTime(), id)
        log.info(`Conversation created: ${id} (${username})`)
        return {id, ...meta}
    }

    const listConversations = async ({username}) => {
        const ids = await redis.zrevrange(getIndexKey(username), 0, -1)
        const conversations = []
        const staleIds = []
        for (const id of ids) {
            const rawMeta = await redis.get(getMetaKey(username, id))
            if (rawMeta) {
                conversations.push({id, ...JSON.parse(rawMeta)})
            } else {
                staleIds.push(id)
            }
        }
        if (staleIds.length > 0) {
            await redis.zrem(getIndexKey(username), ...staleIds)
            log.debug(`Pruned ${staleIds.length} stale index entries for ${username}`)
        }
        return conversations
    }

    const loadConversation = async ({username, conversationId}) => {
        const rawMeta = await redis.get(getMetaKey(username, conversationId))
        if (!rawMeta) {
            return null
        }
        const meta = JSON.parse(rawMeta)
        const rawMessages = await redis.lrange(getMessagesKey(username, conversationId), 0, -1)
        const messages = rawMessages.map(m => JSON.parse(m))
        return {meta, messages}
    }

    const deleteConversation = async ({username, conversationId}) => {
        const metaKey = getMetaKey(username, conversationId)
        const messagesKey = getMessagesKey(username, conversationId)
        await redis.del(metaKey, messagesKey)
        await redis.zrem(getIndexKey(username), conversationId)
        log.info(`Conversation deleted: ${conversationId} (${username})`)
    }

    const appendMessage = async ({username, conversationId, message}) => {
        const messagesKey = getMessagesKey(username, conversationId)
        const metaKey = getMetaKey(username, conversationId)
        await redis.rpush(messagesKey, JSON.stringify(message))
        await redis.expire(messagesKey, ttlSeconds)
        const raw = await redis.get(metaKey)
        if (raw) {
            const meta = JSON.parse(raw)
            const now = new Date()
            meta.updatedAt = now.toISOString()
            await redis.set(metaKey, JSON.stringify(meta), 'EX', ttlSeconds)
            await redis.zadd(getIndexKey(username), now.getTime(), conversationId)
        }
    }

    const updateTitle = async ({username, conversationId, title}) => {
        const metaKey = getMetaKey(username, conversationId)
        const raw = await redis.get(metaKey)
        if (raw) {
            const meta = JSON.parse(raw)
            meta.title = title
            await redis.set(metaKey, JSON.stringify(meta), 'EX', ttlSeconds)
        }
    }

    const touchConversation = async ({username, conversationId}) => {
        const metaKey = getMetaKey(username, conversationId)
        const messagesKey = getMessagesKey(username, conversationId)
        await redis.expire(metaKey, ttlSeconds)
        await redis.expire(messagesKey, ttlSeconds)
    }

    const deleteAllConversations = async ({username}) => {
        const ids = await redis.zrevrange(getIndexKey(username), 0, -1)
        for (const id of ids) {
            await redis.del(getMetaKey(username, id), getMessagesKey(username, id))
        }
        await redis.del(getIndexKey(username))
        log.info(`All conversations deleted (${ids.length}) for ${username}`)
    }

    return {createConversation, listConversations, loadConversation, deleteConversation, deleteAllConversations, appendMessage, updateTitle, touchConversation}
}

module.exports = {createConversationStore}
