const {SessionStore} = require('./session')
const {createSessionHandler} = require('./sessionHandler')
const {createConversationHandler} = require('./conversationHandler')
const {createMessageHandler} = require('./messageHandler')

const createOrchestrator = ({response, config, registry, conversationStore}) => {
    const sessionStore = new SessionStore()
    const ephemeralConversations = new Set()

    const sessionHandler = createSessionHandler({response, conversationStore, sessionStore})
    const conversationHandler = createConversationHandler({response, conversationStore, sessionStore, ephemeralConversations})
    const messageHandler = createMessageHandler({response, config, registry, conversationStore, sessionStore, ephemeralConversations})

    return {sessionHandler, conversationHandler, messageHandler}
}

module.exports = {createOrchestrator}
