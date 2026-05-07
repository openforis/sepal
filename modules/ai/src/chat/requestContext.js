const log = require('#sepal/log').getLogger('requestContext')

const createRequestContext = ({
    response, conversationStore,
    username, clientId, subscriptionId,
    session, conversationId, messages
}) => {
    const send = data => response.send({username, clientId, subscriptionId, data})
    const request = (data, options = {}) =>
        response.request({username, clientId, subscriptionId, data, ...options})

    const sendChatResponse = ({text, complete} = {}) => {
        const data = {type: 'chat-response'}
        if (conversationId !== undefined) data.conversationId = conversationId
        if (text !== undefined) data.text = text
        if (complete !== undefined) data.complete = complete
        send(data)
    }

    const persistMessage = async message => {
        if (!conversationStore || !conversationId) return
        try {
            await conversationStore.appendMessage({username, conversationId, message})
        } catch (error) {
            log.error('Failed to persist message:', error)
        }
    }

    return {
        username, clientId, subscriptionId, session, conversationId, messages,
        send, request, sendChatResponse, persistMessage
    }
}

module.exports = {createRequestContext}
