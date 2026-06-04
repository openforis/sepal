const {v4: uuid} = require('uuid')

const createSessionHandler = ({response, conversationStore, sessionStore}) => {
    const ephemeralConversations = new Set() // IDs not yet persisted to Redis

    const createConversation = ({username, clientId, subscriptionId}) => {
        const id = uuid()
        const now = new Date().toISOString()
        const session = sessionStore.get({clientId, subscriptionId})
        if (session) {
            // Discard previous ephemeral conversation if any
            if (session.conversationId && ephemeralConversations.has(session.conversationId)) {
                ephemeralConversations.delete(session.conversationId)
            }
            session.conversationId = id
            session.messages = []
            session.workflow = null
        }
        ephemeralConversations.add(id)
        response.send({username, clientId, subscriptionId, data: {type: 'conversation-created', conversationId: id, title: '', createdAt: now, updatedAt: now}})
        response.broadcast({username, excludeClientId: clientId, data: {type: 'conversation-claimed', conversationId: id}})
    }

    const createSession = async ({username, clientId, subscriptionId}) => {
        sessionStore.create({username, clientId, subscriptionId})
        if (conversationStore) {
            const conversations = await conversationStore.listConversations({username})
            if (conversations.length === 0) {
                createConversation({username, clientId, subscriptionId})
            } else {
                response.send({username, clientId, subscriptionId, data: {type: 'conversations', conversations}})
            }
        }
    }

    const removeSession = ({clientId, subscriptionId}) => {
        sessionStore.remove({clientId, subscriptionId})
    }

    const removeClientSessions = ({clientId}) => {
        sessionStore.removeByClient({clientId})
    }

    const removeUserSessions = ({username}) => {
        sessionStore.removeByUser({username})
    }

    const shutdown = () => {
        sessionStore.clear()
    }

    return {createSession, removeSession, removeClientSessions, removeUserSessions, shutdown}
}

module.exports = {createSessionHandler}
