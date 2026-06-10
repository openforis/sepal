import {createUserChats} from '#mcp/chat/conversation/userChats'
import {createDiagnostics} from '#mcp/chat/diagnostics'
import {mainSystemPrompt} from '#mcp/chat/llmText/prompts'
import {createToolRegistry} from '#mcp/chat/tools/registry'

import {
    aFakeLlm, anAdvancingClock,
    aRecordingBus, createInMemoryConversationsStore, createInMemoryHistory, run
} from '../harness.js'

const SUB = {clientId: 'c1', subscriptionId: 's1'}
const T0 = new Date(1700000000000).toISOString()

// Chat storage double keyed exactly like the Redis port: one conversations
// store per username, one history per (username, conversationId). Memoized so
// a test can seed through the same instance the registry later reads.
function aFakeChatStorage() {
    const conversationsByUser = new Map()
    const historiesByKey = new Map()
    return {
        conversationsFor(username) {
            if (!conversationsByUser.has(username)) conversationsByUser.set(username, createInMemoryConversationsStore())
            return conversationsByUser.get(username)
        },
        historyFor(username, conversationId) {
            const key = `${username}:${conversationId}`
            if (!historiesByKey.has(key)) historiesByKey.set(key, createInMemoryHistory())
            return historiesByKey.get(key)
        }
    }
}

function aUserChats({chatStorage = aFakeChatStorage(), llm = aFakeLlm({replies: [{text: 'ok'}]})} = {}) {
    return createUserChats({
        chatStorage,
        llm,
        tools: createToolRegistry({tools: [], bus: aRecordingBus()}),
        bus: aRecordingBus(),
        clock: anAdvancingClock([1700000000000]),
        createId: () => 'conv-1',
        diagnostics: createDiagnostics()
    })
}

describe('per-user UserChats registry', () => {

    describe('the main system prompt', () => {

        it('prepends the main system prompt to a new conversation\'s first LLM call', () => {
            const llm = aFakeLlm({replies: [{text: 'hi'}]})
            const alice = aUserChats({llm}).chatFor('alice')

            run(alice.handle$({type: 'create-conversation'}))
            run(alice.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB}))

            expect(llm.receivedMessages[0][0]).toEqual({role: 'system', content: mainSystemPrompt()})
        })
    })

    describe('rebuilding a conversation that exists only in storage', () => {

        it('rehydrates persisted history after the system prompt', () => {
            const storage = aFakeChatStorage()
            run(storage.conversationsFor('alice').add$({id: 'conv-1', title: '', createdAt: T0, updatedAt: T0}))
            run(storage.historyFor('alice', 'conv-1').append$({role: 'user', content: 'earlier'}))
            run(storage.historyFor('alice', 'conv-1').append$({role: 'assistant', content: 'reply'}))
            const llm = aFakeLlm({replies: [{text: 'ok'}]})

            run(aUserChats({chatStorage: storage, llm}).chatFor('alice')
                .handle$({type: 'message', conversationId: 'conv-1', text: 'follow-up', ...SUB}))

            expect(llm.receivedMessages[0]).toEqual([
                {role: 'system', content: mainSystemPrompt()},
                {role: 'user', content: 'earlier'},
                {role: 'assistant', content: 'reply'},
                {role: 'user', content: 'follow-up'}
            ])
        })
    })

    describe('one chat per username', () => {
        let chats
        beforeEach(() => {
            chats = aUserChats()
        })

        it('returns the same UserChat instance for repeat calls with the same username', () => {
            expect(chats.chatFor('alice')).toBe(chats.chatFor('alice'))
        })

        it('builds a distinct UserChat per username', () => {
            expect(chats.chatFor('alice')).not.toBe(chats.chatFor('bob'))
        })
    })
})
