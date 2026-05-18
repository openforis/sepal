// Registry of UserChat keyed by username, lazy-built on first touch.
// Loads the main system prompt once and prepends it to each new
// Conversation's initial messages.

const {map} = require('rxjs')
const {createConversation} = require('./conversation')
const {createConversations} = require('./conversations')
const {createGuiContexts} = require('./guiContexts')
const {createTitleGenerator} = require('./titleGenerator')
const {createMessageHandler} = require('./messageHandler')
const {createUserChat} = require('./userChat')
const {mainSystemPrompt} = require('../llmText/prompts')

function createUserChats({chatStorage, llm, tools, tracer, bus, clock, createId}) {
    const chats = new Map()
    const systemMessage = {role: 'system', content: mainSystemPrompt()}

    return {chatFor}

    function chatFor(username) {
        if (!chats.has(username)) chats.set(username, buildChat(username))
        return chats.get(username)
    }

    function buildChat(username) {
        const conversationsStore = chatStorage.conversationsFor(username)
        const titleGenerator = createTitleGenerator({llm, conversationsStore, tracer, bus})
        const conversations = createConversations({
            conversationsStore,
            conversationFor$: id => buildConversation$(username, id),
            createId,
            clock
        })
        const guiContexts = createGuiContexts()
        const messageHandler = createMessageHandler({conversations, guiContexts, titleGenerator, clock})
        return createUserChat({conversations, guiContexts, messageHandler, tracer, bus})
    }

    function buildConversation$(username, id) {
        const history = chatStorage.historyFor(username, id)
        return history.load$().pipe(
            map(persistedMessages => createConversation({
                llm, tracer, tools, history,
                initialMessages: [systemMessage, ...persistedMessages],
                id,
                bus
            }))
        )
    }
}

module.exports = {createUserChats}
