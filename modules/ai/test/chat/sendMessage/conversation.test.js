const {of, throwError} = require('rxjs')
const {aConversation, aFakeHistory, aFakeLlm, aFakeTools, aFakeTracer, run} = require('./builders')

describe('Conversation', () => {

    it('emits the assistant reply text as textDelta events and completes', () => {
        const conversation = aConversation({
            llm: aFakeLlm({replies: [{text: 'Hi alice!'}]})
        })

        const {events, completed} = run(conversation.sendUserMessage$('Hello'))

        expect(events).toEqual([{textDelta: 'Hi alice!'}])
        expect(completed).toBe(true)
    })

    it('persists user and assistant messages to history', () => {
        const history = aFakeHistory()
        const conversation = aConversation({
            llm: aFakeLlm({replies: [{text: 'Hi alice!'}]}),
            history
        })

        run(conversation.sendUserMessage$('Hello'))

        expect(history.appended).toEqual([
            {role: 'user', content: 'Hello'},
            {role: 'assistant', content: 'Hi alice!'}
        ])
    })

    it('passes the message history to the LLM on each turn', () => {
        const llm = aFakeLlm()
        const conversation = aConversation({llm})

        run(conversation.sendUserMessage$('first'))
        run(conversation.sendUserMessage$('second'))

        expect(llm.receivedMessages).toEqual([
            [{role: 'user', content: 'first'}],
            [
                {role: 'user', content: 'first'},
                {role: 'assistant', content: 'response'},
                {role: 'user', content: 'second'}
            ]
        ])
    })

    describe('with a streaming text response', () => {

        it('emits each chunk as a textDelta and persists the assembled text', () => {
            const history = aFakeHistory()
            const conversation = aConversation({
                llm: aFakeLlm({replies: [{textChunks: ['Hi ', 'alice!']}]}),
                history
            })

            const {events} = run(conversation.sendUserMessage$('Hello'))

            expect(events).toEqual([{textDelta: 'Hi '}, {textDelta: 'alice!'}])
            expect(history.appended).toContainEqual({role: 'assistant', content: 'Hi alice!'})
        })
    })

    describe('when the LLM asks for a tool', () => {
        const toolCall = {id: 'recipe-list', name: 'recipe_list', input: {}}
        const toolResult = {recipes: [{id: 'r1', name: 'Mosaic'}]}

        let llm, tools, history, conversation

        beforeEach(() => {
            llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                {text: 'You have 1 recipe: Mosaic.'}
            ]})
            tools = aFakeTools({recipe_list: () => of(toolResult)})
            history = aFakeHistory()
            conversation = aConversation({llm, tools, history})
        })

        it('invokes the tool', () => {
            run(conversation.sendUserMessage$('list my recipes'))

            expect(tools.invocations).toEqual([toolCall])
        })

        it('feeds the tool result back to the LLM on the next step', () => {
            run(conversation.sendUserMessage$('list my recipes'))

            expect(llm.receivedMessages[1]).toEqual([
                {role: 'user', content: 'list my recipes'},
                {role: 'assistant', content: '', toolCalls: [toolCall]},
                {role: 'tool', toolResults: [{toolCallId: toolCall.id, toolName: toolCall.name, result: toolResult}]}
            ])
        })

        it('emits the assistant text after the tool step', () => {
            const {events, completed} = run(conversation.sendUserMessage$('list my recipes'))

            expect(events).toEqual([{textDelta: 'You have 1 recipe: Mosaic.'}])
            expect(completed).toBe(true)
        })

        it('persists user, tool-call, tool-result, and assistant messages', () => {
            run(conversation.sendUserMessage$('list my recipes'))

            expect(history.appended).toEqual([
                {role: 'user', content: 'list my recipes'},
                {role: 'assistant', content: '', toolCalls: [toolCall]},
                {role: 'tool', toolResults: [{toolCallId: toolCall.id, toolName: toolCall.name, result: toolResult}]},
                {role: 'assistant', content: 'You have 1 recipe: Mosaic.'}
            ])
        })
    })

    describe('with a system prompt', () => {

        it('seeds the LLM with the system message before the first user turn', () => {
            const llm = aFakeLlm()
            const conversation = aConversation({llm, systemPrompt: 'You are Sepalito.'})

            run(conversation.sendUserMessage$('Hello'))

            expect(llm.receivedMessages[0]).toEqual([
                {role: 'system', content: 'You are Sepalito.'},
                {role: 'user', content: 'Hello'}
            ])
        })

        it('does not persist the system prompt to history', () => {
            const history = aFakeHistory()
            const conversation = aConversation({history, systemPrompt: 'You are Sepalito.'})

            run(conversation.sendUserMessage$('Hello'))

            expect(history.appended).not.toContainEqual({role: 'system', content: 'You are Sepalito.'})
        })
    })

    describe('with loaded history', () => {

        it('seeds the LLM with the loaded messages before the next user turn', () => {
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

        it('keeps the system prompt before loaded history', () => {
            const llm = aFakeLlm()
            const conversation = aConversation({
                llm,
                systemPrompt: 'You are Sepalito.',
                initialMessages: [{role: 'user', content: 'first'}]
            })

            run(conversation.sendUserMessage$('second'))

            expect(llm.receivedMessages[0]).toEqual([
                {role: 'system', content: 'You are Sepalito.'},
                {role: 'user', content: 'first'},
                {role: 'user', content: 'second'}
            ])
        })
    })

    describe('with runtime turn context', () => {
        const selection = {section: 'process', selectedRecipe: {recipeId: 'r1', recipeName: 'Mosaic'}}

        it('passes the runtime context to the LLM after the history, before the current user message', () => {
            const llm = aFakeLlm()
            const conversation = aConversation({
                llm,
                systemPrompt: 'You are Sepalito.',
                initialMessages: [
                    {role: 'user', content: 'first'},
                    {role: 'assistant', content: 'reply'}
                ]
            })

            run(conversation.sendUserMessage$('second', {selection}))

            expect(llm.receivedMessages[0]).toEqual([
                {role: 'system', content: 'You are Sepalito.'},
                {role: 'user', content: 'first'},
                {role: 'assistant', content: 'reply'},
                {role: 'system', content: expect.stringContaining('"section":"process"')},
                {role: 'user', content: 'second'}
            ])
        })

        it('does not persist the runtime context to history', () => {
            const history = aFakeHistory()
            const conversation = aConversation({history})

            run(conversation.sendUserMessage$('Hello', {selection}))

            expect(history.appended).toEqual([
                {role: 'user', content: 'Hello'},
                {role: 'assistant', content: 'response'}
            ])
        })

        it('does not include the runtime context in the messages snapshot', () => {
            const conversation = aConversation()

            run(conversation.sendUserMessage$('Hello', {selection}))

            expect(conversation.messagesSnapshot()).toEqual([
                {role: 'user', content: 'Hello'},
                {role: 'assistant', content: 'response'}
            ])
        })

        it('includes the runtime context only on the first LLM call of the turn', () => {
            const toolCall = {id: 'recipe-list', name: 'recipe_list', input: {}}
            const llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                {text: 'done'}
            ]})
            const tools = aFakeTools({recipe_list: () => of({recipes: []})})
            const conversation = aConversation({llm, tools})

            run(conversation.sendUserMessage$('list my recipes', {selection}))

            expect(llm.receivedMessages[0]).toContainEqual({
                role: 'system', content: expect.stringContaining('<runtime-context>')
            })
            expect(llm.receivedMessages[1]).not.toContainEqual(
                expect.objectContaining({content: expect.stringContaining('<runtime-context>')})
            )
        })
    })

    describe('observability', () => {

        it('wraps sendUserMessage in conversation.send and each LLM call in llm.respondTo', () => {
            const tracer = aFakeTracer()
            const conversation = aConversation({tracer})

            run(conversation.sendUserMessage$('Hello'))

            expect(tracer.spans).toEqual([
                {name: 'conversation.send', attrs: {conversationId: 'conv1'}},
                {name: 'llm.respondTo', attrs: {messageCount: 1}}
            ])
        })
    })

    describe('when a tool fails', () => {
        const toolCall = {id: 'recipe-list', name: 'recipe_list', input: {}}

        let llm, tools, conversation

        beforeEach(() => {
            llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                {text: 'Sorry, I could not list your recipes.'}
            ]})
            tools = aFakeTools({
                recipe_list: () => throwError(() => new Error('database unreachable'))
            })
            conversation = aConversation({llm, tools})
        })

        it('feeds the error back to the LLM as a tool result', () => {
            run(conversation.sendUserMessage$('list my recipes'))

            expect(llm.receivedMessages[1]).toContainEqual({
                role: 'tool',
                toolResults: [{
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    result: {error: 'database unreachable'}
                }]
            })
        })

        it('still emits the assistant reply', () => {
            const {events} = run(conversation.sendUserMessage$('list my recipes'))

            expect(events).toEqual([{textDelta: 'Sorry, I could not list your recipes.'}])
        })
    })
})
