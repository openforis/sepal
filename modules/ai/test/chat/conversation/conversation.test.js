const {aConversation, aFakeHistory, aFakeLlm, aFakeTracer, run} = require('../builders')

describe('Conversation', () => {

    it('emits the assistant reply text and persists the user-visible turn', () => {
        const history = aFakeHistory()
        const conversation = aConversation({
            llm: aFakeLlm({replies: [{text: 'Hi alice!'}]}),
            history
        })

        const {events, completed} = run(conversation.sendUserMessage$('Hello'))

        expect(events).toEqual([{textDelta: 'Hi alice!'}])
        expect(completed).toBe(true)
        expect(history.appended).toEqual([
            {role: 'user', content: 'Hello'},
            {role: 'assistant', content: 'Hi alice!'}
        ])
    })

    it('streams each text chunk and persists the assembled assistant message', () => {
        const history = aFakeHistory()
        const conversation = aConversation({
            llm: aFakeLlm({replies: [{textChunks: ['Hi ', 'alice!']}]}),
            history
        })

        const {events} = run(conversation.sendUserMessage$('Hello'))

        expect(events).toEqual([{textDelta: 'Hi '}, {textDelta: 'alice!'}])
        expect(history.appended).toContainEqual({role: 'assistant', content: 'Hi alice!'})
    })

    it('continues the next turn with the completed conversation history', () => {
        const llm = aFakeLlm()
        const conversation = aConversation({llm})

        run(conversation.sendUserMessage$('first'))
        run(conversation.sendUserMessage$('second'))

        expect(llm.receivedMessages[1]).toEqual([
            {role: 'user', content: 'first'},
            {role: 'assistant', content: 'response'},
            {role: 'user', content: 'second'}
        ])
    })

    it('uses the system prompt without persisting it as chat history', () => {
        const history = aFakeHistory()
        const llm = aFakeLlm()
        const conversation = aConversation({llm, history, systemPrompt: 'You are Sepalito.'})

        run(conversation.sendUserMessage$('Hello'))

        expect(llm.receivedMessages[0]).toEqual([
            {role: 'system', content: 'You are Sepalito.'},
            {role: 'user', content: 'Hello'}
        ])
        expect(history.appended).not.toContainEqual({role: 'system', content: 'You are Sepalito.'})
    })

    it('loads existing history before the next user turn', () => {
        const llm = aFakeLlm()
        const conversation = aConversation({
            llm,
            initialMessages: [
                {role: 'user', content: 'first'},
                {role: 'assistant', content: 'reply'}
            ]
        })

        run(conversation.sendUserMessage$('second'))

        expect(llm.receivedMessages[0]).toEqual([
            {role: 'user', content: 'first'},
            {role: 'assistant', content: 'reply'},
            {role: 'user', content: 'second'}
        ])
    })

    it('uses runtime turn context without storing it in conversation state', () => {
        const history = aFakeHistory()
        const llm = aFakeLlm()
        const conversation = aConversation({llm, history})
        const selection = {section: 'process', selectedRecipe: {recipeId: 'r1', recipeName: 'Mosaic'}}

        run(conversation.sendUserMessage$('Hello', {selection}))

        expect(llm.receivedMessages[0]).toContainEqual({
            role: 'system',
            content: expect.stringContaining('"recipeName":"Mosaic"')
        })
        expect(history.appended).toEqual([
            {role: 'user', content: 'Hello'},
            {role: 'assistant', content: 'response'}
        ])
        expect(conversation.messagesSnapshot()).toEqual(history.appended)
    })

    it('wraps the user turn and LLM call in trace spans', () => {
        const tracer = aFakeTracer()
        const conversation = aConversation({tracer})

        run(conversation.sendUserMessage$('Hello'))

        expect(tracer.spans).toEqual([
            {name: 'conversation.send', attrs: {conversationId: 'conv1'}},
            {name: 'llm.respondTo', attrs: {messageCount: 1}}
        ])
    })
})
