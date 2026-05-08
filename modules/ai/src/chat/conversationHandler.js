const {v4: uuid} = require('uuid')
const log = require('#sepal/log').getLogger('conversationHandler')

const createConversationHandler = ({response, conversationStore, sessionStore, ephemeralConversations}) => {

    const listConversations = async ({username, clientId, subscriptionId}) => {
        if (!conversationStore) {
            response.send({username, clientId, subscriptionId, data: {type: 'conversations', conversations: []}})
            return
        }
        try {
            const conversations = await conversationStore.listConversations({username})
            response.send({username, clientId, subscriptionId, data: {type: 'conversations', conversations}})
        } catch (error) {
            log.error('Failed to list conversations:', error)
            response.send({username, clientId, subscriptionId, data: {type: 'conversations', conversations: []}})
        }
    }

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

    const selectConversation = async ({username, clientId, subscriptionId, conversationId}) => {
        if (!conversationStore) {
            return
        }
        try {
            await conversationStore.touchConversation({username, conversationId})
            const result = await conversationStore.loadConversation({username, conversationId})
            if (!result) {
                log.warn(`Conversation not found: ${conversationId}`)
                const conversations = await conversationStore.listConversations({username})
                response.send({username, clientId, subscriptionId, data: {type: 'conversations', conversations}})
                return
            }
            const session = sessionStore.get({clientId, subscriptionId})
            if (session) {
                // Discard ephemeral conversation if switching away from it
                if (session.conversationId && ephemeralConversations.has(session.conversationId)) {
                    ephemeralConversations.delete(session.conversationId)
                }
                session.conversationId = conversationId
                session.messages = result.messages
                session.workflow = null
            }
            response.send({username, clientId, subscriptionId, data: {type: 'conversation-loaded', conversationId, messages: result.messages}})
            response.broadcast({username, excludeClientId: clientId, data: {type: 'conversation-claimed', conversationId}})
        } catch (error) {
            log.error('Failed to select conversation:', error)
            response.send({username, clientId, subscriptionId, data: {type: 'chat-response', text: 'Failed to load conversation. Please try again.', complete: true}})
        }
    }

    const deleteConversation = async ({username, clientId, subscriptionId, conversationId}) => {
        if (!conversationStore) {
            return
        }
        const session = sessionStore.get({clientId, subscriptionId})
        if (ephemeralConversations.has(conversationId)) {
            // Not persisted — just discard from memory
            ephemeralConversations.delete(conversationId)
            if (session && session.conversationId === conversationId) {
                session.conversationId = null
                session.messages = []
                session.workflow = null
            }
            return
        }
        try {
            await conversationStore.deleteConversation({username, conversationId})
            if (session && session.conversationId === conversationId) {
                session.conversationId = null
                session.messages = []
                session.workflow = null
            }
            const conversations = await conversationStore.listConversations({username})
            response.send({username, clientId, subscriptionId, data: {type: 'conversations', conversations}})
        } catch (error) {
            log.error('Failed to delete conversation:', error)
            await listConversations({username, clientId, subscriptionId})
        }
    }

    const deleteAllConversations = async ({username, clientId, subscriptionId}) => {
        if (!conversationStore) {
            return
        }
        const session = sessionStore.get({clientId, subscriptionId})
        ephemeralConversations.clear()
        if (session) {
            session.conversationId = null
            session.messages = []
            session.workflow = null
        }
        try {
            await conversationStore.deleteAllConversations({username})
            response.send({username, clientId, subscriptionId, data: {type: 'conversations', conversations: []}})
        } catch (error) {
            log.error('Failed to delete all conversations:', error)
            await listConversations({username, clientId, subscriptionId})
        }
    }

    return {listConversations, createConversation, selectConversation, deleteConversation, deleteAllConversations}
}

module.exports = {createConversationHandler}
