const {of, throwError} = require('rxjs')
const {MAX_TOOL_ROUNDS} = require('#mcp/chat/sendMessage/conversation')
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

    describe('with tools', () => {

        it('passes the tool schemas to the LLM on each call', () => {
            const llm = aFakeLlm()
            const schemas = [{name: 'echo', description: 'Echo.', parameters: {type: 'object'}}]
            const conversation = aConversation({llm, tools: aFakeTools({}, schemas)})

            run(conversation.sendUserMessage$('hi'))

            expect(llm.receivedTools[0]).toEqual(schemas)
        })
    })

    describe('when the LLM asks for a tool', () => {
        const toolCall = {id: 'recipe-list', name: 'recipe_list', input: {}}
        const toolResult = {recipes: [{id: 'r1', name: 'Mosaic'}]}
        const enveloped = {ok: true, data: toolResult}

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

        it('passes the turn toolContext through to tool invocation', () => {
            const seen = []
            tools = aFakeTools({recipe_list: (_input, context) => {
                seen.push(context)
                return of(toolResult)
            }})
            conversation = aConversation({llm, tools, history})
            const toolContext = {channel: {}, conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

            run(conversation.sendUserMessage$('list my recipes', {toolContext}))

            expect(seen).toEqual([toolContext])
        })

        it('feeds the enveloped tool result back to the LLM on the next step', () => {
            run(conversation.sendUserMessage$('list my recipes'))

            expect(llm.receivedMessages[1]).toEqual([
                {role: 'user', content: 'list my recipes'},
                {role: 'assistant', content: '', toolCalls: [toolCall]},
                {role: 'tool', toolResults: [{toolCallId: toolCall.id, toolName: toolCall.name, result: enveloped}]}
            ])
        })

        it('emits tool-start and tool-end events around the assistant text', () => {
            const {events, completed} = run(conversation.sendUserMessage$('list my recipes'))

            expect(events).toEqual([
                {toolStart: {toolCallId: toolCall.id, toolName: toolCall.name}},
                {toolEnd: {toolCallId: toolCall.id, toolName: toolCall.name, ok: true}},
                {textDelta: 'You have 1 recipe: Mosaic.'}
            ])
            expect(completed).toBe(true)
        })

        it('persists user, tool-call, tool-result, and assistant messages', () => {
            run(conversation.sendUserMessage$('list my recipes'))

            expect(history.appended).toEqual([
                {role: 'user', content: 'list my recipes'},
                {role: 'assistant', content: '', toolCalls: [toolCall]},
                {role: 'tool', toolResults: [{toolCallId: toolCall.id, toolName: toolCall.name, result: enveloped}]},
                {role: 'assistant', content: 'You have 1 recipe: Mosaic.'}
            ])
        })
    })

    describe('with multiple tool calls in one assistant response', () => {
        const callA = {id: 'a', name: 'recipe_list', input: {}}
        const callB = {id: 'b', name: 'project_list', input: {}}

        it('invokes every tool call and feeds all enveloped results back', () => {
            const llm = aFakeLlm({replies: [
                {toolCalls: [callA, callB]},
                {text: 'done'}
            ]})
            const tools = aFakeTools({
                recipe_list: () => of({recipes: 1}),
                project_list: () => of({projects: 1})
            })
            const conversation = aConversation({llm, tools})

            run(conversation.sendUserMessage$('list everything'))

            expect(tools.invocations).toEqual([callA, callB])
            expect(llm.receivedMessages[1]).toContainEqual({
                role: 'tool',
                toolResults: [
                    {toolCallId: 'a', toolName: 'recipe_list', result: {ok: true, data: {recipes: 1}}},
                    {toolCallId: 'b', toolName: 'project_list', result: {ok: true, data: {projects: 1}}}
                ]
            })
        })
    })

    describe('when the LLM asks for an unknown tool', () => {
        const unknownCall = {id: 'u', name: 'nonexistent', input: {}}

        it('feeds a structured UNKNOWN_TOOL error back to the LLM', () => {
            const llm = aFakeLlm({replies: [
                {toolCalls: [unknownCall]},
                {text: 'sorry'}
            ]})
            const conversation = aConversation({llm, tools: aFakeTools({})})

            run(conversation.sendUserMessage$('do something'))

            expect(llm.receivedMessages[1]).toContainEqual({
                role: 'tool',
                toolResults: [{
                    toolCallId: 'u',
                    toolName: 'nonexistent',
                    result: {ok: false, error: {code: 'UNKNOWN_TOOL', message: 'Tool not found: nonexistent'}}
                }]
            })
        })
    })

    describe('when the LLM never stops asking for tools', () => {
        const toolCall = {id: 't', name: 'recipe_list', input: {}}

        it('stops the tool loop at the round cap and still completes with a final message', () => {
            const llm = aFakeLlm({replies: [{toolCalls: [toolCall]}]})
            const tools = aFakeTools({recipe_list: () => of({})})
            const conversation = aConversation({llm, tools})

            const {events, completed} = run(conversation.sendUserMessage$('loop forever'))

            expect(completed).toBe(true)
            expect(llm.receivedMessages).toHaveLength(MAX_TOOL_ROUNDS)
            expect(events.some(event => event.textDelta)).toBe(true)
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

        it('feeds the structured error envelope back to the LLM as a tool result', () => {
            run(conversation.sendUserMessage$('list my recipes'))

            expect(llm.receivedMessages[1]).toContainEqual({
                role: 'tool',
                toolResults: [{
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    result: {ok: false, error: {code: 'TOOL_FAILED', message: 'database unreachable'}}
                }]
            })
        })

        it('reports the failed tool in the tool-end event and still emits the assistant reply', () => {
            const {events} = run(conversation.sendUserMessage$('list my recipes'))

            expect(events).toEqual([
                {toolStart: {toolCallId: toolCall.id, toolName: toolCall.name}},
                {toolEnd: {toolCallId: toolCall.id, toolName: toolCall.name, ok: false}},
                {textDelta: 'Sorry, I could not list your recipes.'}
            ])
        })
    })
})
