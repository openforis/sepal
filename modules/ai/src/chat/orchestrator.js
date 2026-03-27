const {SessionStore} = require('./session')
const {createSessionHandler} = require('./sessionHandler')
const {createConversationHandler} = require('./conversationHandler')
const {createMessageHandler} = require('./messageHandler')

const createOrchestrator = ({response, config, registry, conversationStore}) => {
    const sessionStore = new SessionStore({ttlMs: config.sessionTtlMs})

    const sessionHandler = createSessionHandler({response, conversationStore, sessionStore})
    const conversationHandler = createConversationHandler({response, conversationStore, sessionStore})
    const messageHandler = createMessageHandler({response, config, registry, conversationStore, sessionStore})

    return {sessionHandler, conversationHandler, messageHandler}
}

module.exports = {createOrchestrator}
