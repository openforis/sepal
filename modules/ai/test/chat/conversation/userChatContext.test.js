const {of} = require('rxjs')
const {aFakeLlm, aFakeTools, run} = require('../builders')
const {aUserChatFixture, runtimeContextContent} = require('./userChatHarness')

describe('UserChat GUI context', () => {
    const sub = {clientId: 'c1', subscriptionId: 's1'}

    it('attaches the sending subscription context to the LLM turn', () => {
        const {channel, llm, userChat} = aUserChatFixture()
        run(userChat.createConversation$({channel}))
        run(userChat.updateContext$({...sub, guiContext: {section: 'process'}}))

        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello', ...sub}))

        expect(runtimeContextContent(llm.receivedMessages[0])).toContain('"section":"process"')
    })

    it('does not leak one subscription context into another subscription', () => {
        const {channel, llm, userChat} = aUserChatFixture()
        run(userChat.createConversation$({channel}))
        run(userChat.updateContext$({...sub, guiContext: {section: 'process'}}))

        run(userChat.sendUserMessage$({
            channel, conversationId: 'conv-1', text: 'hello', clientId: 'c1', subscriptionId: 's2'
        }))

        expect(llm.receivedMessages[0]).toEqual([{role: 'user', content: 'hello'}])
    })

    it('uses the context from the subscription that sent the message', () => {
        const subscriptionA = {clientId: 'c1', subscriptionId: 's1'}
        const subscriptionB = {clientId: 'c2', subscriptionId: 's1'}
        const {channel, llm, userChat} = aUserChatFixture()
        run(userChat.createConversation$({channel}))
        run(userChat.updateContext$({...subscriptionA, guiContext: {selectedRecipe: {recipeName: 'Mosaic'}}}))
        run(userChat.updateContext$({...subscriptionB, guiContext: {selectedRecipe: {recipeName: 'Classification'}}}))

        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'change this', ...subscriptionA}))
        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'change this too', ...subscriptionB}))

        expect(runtimeContextContent(llm.receivedMessages[0])).toContain('"recipeName":"Mosaic"')
        expect(runtimeContextContent(llm.receivedMessages[0])).not.toContain('Classification')
        expect(runtimeContextContent(llm.receivedMessages[1])).toContain('"recipeName":"Classification"')
        expect(runtimeContextContent(llm.receivedMessages[1])).not.toContain('Mosaic')
    })

    it('drops context after the subscription clears it', () => {
        const {channel, llm, userChat} = aUserChatFixture()
        run(userChat.createConversation$({channel}))
        run(userChat.updateContext$({...sub, guiContext: {section: 'process'}}))
        run(userChat.clearContext$({...sub}))

        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello', ...sub}))

        expect(llm.receivedMessages[0]).toEqual([{role: 'user', content: 'hello'}])
    })
})

describe('UserChat tool context', () => {
    const echoCall = {id: 't1', name: 'echo', input: {}}

    it('passes conversation, subscription, and cached GUI context to tools', () => {
        const seen = []
        const llm = aFakeLlm({replies: [{toolCalls: [echoCall]}, {text: 'done'}]})
        const tools = aFakeTools({echo: (_input, context) => {
            seen.push(context)
            return of({})
        }})
        const {channel, userChat} = aUserChatFixture({llm, tools})
        run(userChat.createConversation$({channel}))
        run(userChat.updateContext$({clientId: 'c1', subscriptionId: 's1', guiContext: {section: 'process'}}))

        run(userChat.sendUserMessage$({
            channel, conversationId: 'conv-1', text: 'echo it', clientId: 'c1', subscriptionId: 's1'
        }))

        expect(seen).toEqual([{
            conversationId: 'conv-1', clientId: 'c1', subscriptionId: 's1',
            guiContext: {section: 'process'}
        }])
    })

    it('prefers message GUI context over stale cached context for both LLM and tool context', () => {
        const seen = []
        const llm = aFakeLlm({replies: [{toolCalls: [echoCall]}, {text: 'done'}]})
        const tools = aFakeTools({echo: (_input, context) => {
            seen.push(context)
            return of({})
        }})
        const {channel, userChat} = aUserChatFixture({llm, tools})
        run(userChat.createConversation$({channel}))
        run(userChat.updateContext$({clientId: 'c1', subscriptionId: 's1', guiContext: {section: 'browse'}}))

        run(userChat.sendUserMessage$({
            channel, conversationId: 'conv-1', text: 'echo it', clientId: 'c1', subscriptionId: 's1',
            guiContext: {section: 'process'}
        }))

        expect(seen[0].guiContext).toEqual({section: 'process'})
        expect(runtimeContextContent(llm.receivedMessages[0])).toContain('"section":"process"')
        expect(runtimeContextContent(llm.receivedMessages[0])).not.toContain('browse')
    })

    it('broadcasts tool-start and tool-end to the channel for each invocation', () => {
        const llm = aFakeLlm({replies: [{toolCalls: [echoCall]}, {text: 'done'}]})
        const tools = aFakeTools({echo: () => of({})})
        const {channel, userChat} = aUserChatFixture({llm, tools})
        run(userChat.createConversation$({channel}))

        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'echo it'}))

        expect(channel.toolStarts).toEqual([
            {conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', input: {}}
        ])
        expect(channel.toolEnds).toEqual([
            {conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', ok: true, data: {}, error: undefined}
        ])
    })

    it('broadcasts a tool-round cap notice to the channel when the loop hits the cap', () => {
        const loopLlm = aFakeLlm({replies: [{toolCalls: [echoCall]}]})
        const tools = aFakeTools({echo: () => of({})})
        const {channel, userChat} = aUserChatFixture({llm: loopLlm, tools})
        run(userChat.createConversation$({channel}))

        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'spin'}))

        expect(channel.notices).toEqual([{
            conversationId: 'conv-1',
            content: expect.stringContaining('rephrasing'),
            display: {
                key: 'home.chat.notices.toolRoundCap',
                args: {max: 8},
                fallback: expect.stringContaining('rephrasing')
            }
        }])
    })
})
