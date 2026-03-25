const {Redis} = require('ioredis')
const {v4: uuid} = require('uuid')
const log = require('#sepal/log').getLogger('conversationStore')

const metaKey = (username, id) => `conv:${username}:${id}:meta`
const messagesKey = (username, id) => `conv:${username}:${id}:messages`
const indexKey = username => `conv:${username}:index`

const createConversationStore = ({redisHost, ttlMs}) => {
    const ttlSeconds = Math.round(ttlMs / 1000)
    const redis = new Redis({host: redisHost, db: 0})

    redis.on('error', error => log.error('Redis error:', error))
    redis.on('connect', () => log.info('Connected to Redis'))

    const createConversation = async ({username, id: providedId}) => {
        const id = providedId || uuid()
        const now = new Date().toISOString()
        const meta = {title: '', createdAt: now, updatedAt: now}
        const mk = metaKey(username, id)
        await redis.set(mk, JSON.stringify(meta), 'EX', ttlSeconds)
        await redis.zadd(indexKey(username), Date.now(), id)
        log.info(`Conversation created: ${id} (${username})`)
        return {id, ...meta}
    }

    const listConversations = async ({username}) => {
        const ids = await redis.zrevrange(indexKey(username), 0, -1)
        const conversations = []
        const staleIds = []
        for (const id of ids) {
            const raw = await redis.get(metaKey(username, id))
            if (raw) {
                conversations.push({id, ...JSON.parse(raw)})
            } else {
                staleIds.push(id)
            }
        }
        if (staleIds.length > 0) {
            await redis.zrem(indexKey(username), ...staleIds)
            log.debug(`Pruned ${staleIds.length} stale index entries for ${username}`)
        }
        return conversations
    }

    const loadConversation = async ({username, conversationId}) => {
        const raw = await redis.get(metaKey(username, conversationId))
        if (!raw) {
            return null
        }
        const meta = JSON.parse(raw)
        const rawMessages = await redis.lrange(messagesKey(username, conversationId), 0, -1)
        const messages = rawMessages.map(m => JSON.parse(m))
        return {meta, messages}
    }

    const deleteConversation = async ({username, conversationId}) => {
        const mk = metaKey(username, conversationId)
        const msgk = messagesKey(username, conversationId)
        await redis.del(mk, msgk)
        await redis.zrem(indexKey(username), conversationId)
        log.info(`Conversation deleted: ${conversationId} (${username})`)
    }

    const appendMessage = async ({username, conversationId, message}) => {
        const msgk = messagesKey(username, conversationId)
        const mk = metaKey(username, conversationId)
        await redis.rpush(msgk, JSON.stringify(message))
        await redis.expire(msgk, ttlSeconds)
        const raw = await redis.get(mk)
        if (raw) {
            const meta = JSON.parse(raw)
            meta.updatedAt = new Date().toISOString()
            await redis.set(mk, JSON.stringify(meta), 'EX', ttlSeconds)
            await redis.zadd(indexKey(username), Date.now(), conversationId)
        }
    }

    const updateTitle = async ({username, conversationId, title}) => {
        const mk = metaKey(username, conversationId)
        const raw = await redis.get(mk)
        if (raw) {
            const meta = JSON.parse(raw)
            meta.title = title
            await redis.set(mk, JSON.stringify(meta), 'EX', ttlSeconds)
        }
    }

    const touchConversation = async ({username, conversationId}) => {
        const mk = metaKey(username, conversationId)
        const msgk = messagesKey(username, conversationId)
        await redis.expire(mk, ttlSeconds)
        await redis.expire(msgk, ttlSeconds)
    }

    return {createConversation, listConversations, loadConversation, deleteConversation, appendMessage, updateTitle, touchConversation}
}

module.exports = {createConversationStore}
