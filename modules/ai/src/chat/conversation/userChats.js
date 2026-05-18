// Registry of UserChat keyed by username. Lazy-builds a UserChat on
// first touch and reuses it for the user's lifetime in the process.
// Loads the main system prompt once at construction and prepends it to
// each Conversation's initial messages.

const {map} = require('rxjs')
const {createConversation} = require('./conversation')
const {createConversations} = require('./conversations')
const {createTabContexts} = require('./tabContexts')
const {createTitleGenerator} = require('./titleGenerator')
const {createTurnFlow} = require('./turnFlow')
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
        const tabContexts = createTabContexts()
        const turnFlow = createTurnFlow({conversations, tabContexts, titleGenerator, clock})
        return createUserChat({conversations, tabContexts, turnFlow, tracer, bus})
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
