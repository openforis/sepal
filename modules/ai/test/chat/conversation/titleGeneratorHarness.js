const {tap} = require('rxjs')
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
    const raw = createTitleGenerator({llm, conversationsStore, tracer, bus})
    // afterTurn$ now emits channel events; the harness keeps the
    // pre-refactor API by accepting {channel, ...} and dispatching each
    // emitted event onto the channel for the test to assert on.
    const titleGen = {
        afterTurn$({channel: dispatchTo, ...args}) {
            const work$ = raw.afterTurn$(args)
            return dispatchTo ? work$.pipe(tap(event => dispatchTo.dispatch(event))) : work$
        }
    }
    return {titleGen, channel, conversationsStore, llm, tracer, bus}
}

function aConversation(messages) {
    return {messagesSnapshot: () => messages}
}

module.exports = {UNTITLED_META, aTitleGenFixture, aConversation}
