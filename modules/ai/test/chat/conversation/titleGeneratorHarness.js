const {createTitleGenerator} = require('#mcp/chat/conversation/titleGenerator')
const {createInMemoryConversationsStore} = require('./inMemoryConversationsStore')
const {aFakeBus, aFakeChannel, aFakeLlm, aFakeTracer} = require('../builders')

const UNTITLED_META = {
    id: 'conv-1', title: '',
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z'
}

function aTitleGenFixture(overrides = {}) {
    const channel = overrides.channel ?? aFakeChannel()
    const conversationsStore = overrides.conversationsStore
        ?? createInMemoryConversationsStore([overrides.meta ?? UNTITLED_META])
    const llm = overrides.llm ?? aFakeLlm({replies: [{text: 'NDVI change Kenya'}]})
    const tracer = overrides.tracer ?? aFakeTracer()
    const bus = overrides.bus ?? aFakeBus()
    const titleGen = createTitleGenerator({llm, conversationsStore, tracer, bus})
    return {titleGen, channel, conversationsStore, llm, tracer, bus}
}

function aConversation(messages) {
    return {messagesSnapshot: () => messages}
}

module.exports = {UNTITLED_META, aTitleGenFixture, aConversation}
