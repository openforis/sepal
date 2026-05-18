const {map} = require('rxjs')
const {createConversation} = require('./conversation')
const {createTitleGenerator} = require('./titleGenerator')
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
        return createUserChat({
            conversationsStore,
            clock,
            createId,
            titleGenerator,
            conversationFor$: id => buildConversation$(username, id)
        })
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
