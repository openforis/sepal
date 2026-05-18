const {createTitleGenerator} = require('#mcp/chat/conversation/titleGenerator')
const {createInMemoryConversationsStore} = require('./inMemoryConversationsStore')
const {aFakeBus, aFakeLlm} = require('../builders')

const UNTITLED_META = {
    id: 'conv-1', title: '',
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z'
}

function aTitleGenFixture(overrides = {}) {
    const conversationsStore = overrides.conversationsStore
        ?? createInMemoryConversationsStore([overrides.meta ?? UNTITLED_META])
    const llm = overrides.llm ?? aFakeLlm({replies: [{text: 'NDVI change Kenya'}]})
    const bus = overrides.bus ?? aFakeBus()
    const titleGen = createTitleGenerator({llm, conversationsStore, bus})
    return {titleGen, conversationsStore, llm, bus}
}

function aConversation(messages) {
    return {messagesSnapshot: () => messages}
}

function titleUpdates(events) {
    return events
        .filter(event => event.kind === 'conversation-updated')
        .map(event => ({id: event.payload.conversationId, title: event.payload.title}))
}

module.exports = {UNTITLED_META, aTitleGenFixture, aConversation, titleUpdates}
