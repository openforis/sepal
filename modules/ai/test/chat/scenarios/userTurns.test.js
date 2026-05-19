const {of} = require('rxjs')
const {emitChannel, guiAction} = require('#mcp/chat/channelEvents')
const {guiContextTool} = require('#mcp/chat/tools/guiContextTool')
const {
    aConversationHarness, aUserChatHarness, aControllableLlm,
    createInMemoryHistory, collect, firstValue, run
} = require('../harness')

describe('user turns', () => {

    const SUB = {clientId: 'c1', subscriptionId: 's1'}
    const echoSchema = {
        name: 'echo',
        description: 'Echo input.',
        parameters: {type: 'object', properties: {text: {type: 'string'}}, additionalProperties: true}
    }
    const recipeListSchema = {
        name: 'recipe_list',
        description: 'List recipes.',
        parameters: {type: 'object', properties: {}, additionalProperties: true}
    }
    const projectListSchema = {
        name: 'project_list',
        description: 'List projects.',
        parameters: {type: 'object', properties: {}, additionalProperties: true}
    }

    describe('happy turn', () => {

        describe('with a single text reply', () => {
            let harness
            beforeEach(() => {
                harness = aConversationHarness({replies: [{text: 'Hi alice!'}]})
            })

            it('streams the assistant text as a textDelta on the channel', async () => {
                const events = await collect(harness.send$('Hello'))

                expect(events).toContainEqual({textDelta: 'Hi alice!'})
            })

            it('persists the user message and the assistant reply in history', async () => {
                await collect(harness.send$('Hello'))

                const stored = await firstValue(harness.history.load$())
                expect(stored).toEqual([
                    {role: 'user', content: 'Hello'},
                    {role: 'assistant', content: 'Hi alice!'}
                ])
            })
        })

        describe('with a chunked text reply', () => {
            it('streams each text chunk and persists the assembled assistant message', async () => {
                const harness = aConversationHarness({
                    replies: [{textChunks: ['Hi ', 'alice!']}]
                })

                const events = await collect(harness.send$('Hello'))

                expect(events).toEqual([{textDelta: 'Hi '}, {textDelta: 'alice!'}])
                const stored = await firstValue(harness.history.load$())
                expect(stored).toContainEqual({role: 'assistant', content: 'Hi alice!'})
            })
        })

        describe('with initial messages seeded into the conversation', () => {
            it('keeps initial messages in the LLM view without persisting them as chat history', async () => {
                const harness = aConversationHarness({
                    replies: [{text: 'ok'}],
                    initialMessages: [{role: 'system', content: 'You are Sepalito.'}],
                    history: createInMemoryHistory()
                })

                await collect(harness.send$('Hello'))

                expect(harness.llm.receivedMessages[0]).toEqual([
                    {role: 'system', content: 'You are Sepalito.'},
                    {role: 'user', content: 'Hello'}
                ])
                const stored = await firstValue(harness.history.load$())
                expect(stored).not.toContainEqual({role: 'system', content: 'You are Sepalito.'})
            })
        })

        describe('with a runtime GUI context attached to the turn', () => {
            const guiContext = {section: 'process', selectedRecipe: {recipeId: 'r1', recipeName: 'Mosaic'}}

            let harness
            beforeEach(() => {
                harness = aConversationHarness({replies: [{text: 'ok'}]})
            })

            it('passes the GUI context as an LLM-visible runtime-context message', async () => {
                await collect(harness.send$('Hello', {guiContext}))

                expect(harness.llm.receivedMessages[0]).toContainEqual({
                    role: 'system',
                    content: expect.stringContaining('"recipeName":"Mosaic"')
                })
            })

            it('does not persist the runtime-context message into chat history', async () => {
                await collect(harness.send$('Hello', {guiContext}))

                const stored = await firstValue(harness.history.load$())
                expect(stored.find(message => /<runtime-context>/.test(message.content || ''))).toBeUndefined()
            })
        })
    })

    describe('history projection across turns', () => {

        it('the second turn LLM call sees the completed first-turn user + assistant', async () => {
            const harness = aConversationHarness({
                replies: [{text: 'response one'}, {text: 'response two'}]
            })

            await collect(harness.send$('first'))
            await collect(harness.send$('second'))

            expect(harness.llm.receivedMessages[1]).toEqual([
                {role: 'user', content: 'first'},
                {role: 'assistant', content: 'response one'},
                {role: 'user', content: 'second'}
            ])
        })

        it('does not let a completed tool-using first turn drift the next turn back to the prior tool', async () => {
            const projectCall = {id: 'pc', name: 'project_list', input: {}}
            const recipeCall = {id: 'rc', name: 'recipe_list', input: {}}
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [projectCall]},
                    {text: 'You have 1 project.'},
                    {toolCalls: [recipeCall]},
                    {text: 'You have 1 recipe.'}
                ],
                tools: [
                    {...projectListSchema, invoke$: () => of({projects: [{id: 'p1', name: 'Kenya'}]})},
                    {...recipeListSchema, invoke$: () => of({recipes: [{id: 'r1', name: 'Mosaic'}]})}
                ]
            })

            await collect(harness.send$('list my projects'))
            await collect(harness.send$('list my recipes'))

            expect(harness.llm.receivedMessages[2]).toEqual([
                {role: 'user', content: 'list my projects'},
                {role: 'assistant', content: 'You have 1 project.'},
                {role: 'user', content: 'list my recipes'}
            ])
        })
    })

    describe('tool round', () => {

        describe('with one tool call and a follow-up assistant answer', () => {
            const toolCall = {id: 'recipe-list', name: 'recipe_list', input: {}}
            const toolData = {recipes: [{id: 'r1', name: 'Mosaic'}]}

            let harness
            beforeEach(() => {
                harness = aConversationHarness({
                    replies: [
                        {toolCalls: [toolCall]},
                        {text: 'You have 1 recipe: Mosaic.'}
                    ],
                    tools: [{...recipeListSchema, invoke$: () => of(toolData)}]
                })
            })

            it('invokes the requested tool through the registry', async () => {
                await collect(harness.send$('list my recipes'))

                expect(harness.invocations).toEqual([toolCall])
            })

            it('feeds the wrapped tool result back to the LLM on the next round', async () => {
                await collect(harness.send$('list my recipes'))

                expect(harness.llm.receivedMessages[1]).toContainEqual({
                    role: 'tool',
                    toolResults: [{
                        toolCallId: toolCall.id,
                        toolName: toolCall.name,
                        result: {ok: true, data: toolData}
                    }]
                })
            })

            it('emits tool-start, tool-end, and the trailing assistant textDelta on the channel', async () => {
                const events = await collect(harness.send$('list my recipes'))

                expect(events).toEqual([
                    {toolStart: {toolCallId: toolCall.id, toolName: toolCall.name, input: toolCall.input}},
                    {toolEnd: {toolCallId: toolCall.id, toolName: toolCall.name, ok: true, data: toolData, error: undefined}},
                    {textDelta: 'You have 1 recipe: Mosaic.'}
                ])
            })

            it('persists the user message, the tool round, and the assistant answer in history', async () => {
                await collect(harness.send$('list my recipes'))

                const stored = await firstValue(harness.history.load$())
                expect(stored).toEqual([
                    {role: 'user', content: 'list my recipes'},
                    {role: 'assistant', content: '', toolCalls: [toolCall]},
                    {role: 'tool', toolResults: [{toolCallId: toolCall.id, toolName: toolCall.name, result: {ok: true, data: toolData}}]},
                    {role: 'assistant', content: 'You have 1 recipe: Mosaic.'}
                ])
            })

            it('passes the available tool schemas to the LLM', async () => {
                await collect(harness.send$('list my recipes'))

                expect(harness.llm.receivedTools[0]).toEqual([{
                    name: recipeListSchema.name,
                    description: recipeListSchema.description,
                    parameters: recipeListSchema.parameters
                }])
            })
        })

        describe('with multiple tool calls in one assistant response', () => {
            it('invokes every tool call and feeds all results back together on the next round', async () => {
                const callA = {id: 'a', name: 'recipe_list', input: {}}
                const callB = {id: 'b', name: 'project_list', input: {}}
                const harness = aConversationHarness({
                    replies: [
                        {toolCalls: [callA, callB]},
                        {text: 'done'}
                    ],
                    tools: [
                        {...recipeListSchema, invoke$: () => of({recipes: 1})},
                        {...projectListSchema, invoke$: () => of({projects: 1})}
                    ]
                })

                await collect(harness.send$('list everything'))

                expect(harness.invocations).toEqual([callA, callB])
                expect(harness.llm.receivedMessages[1]).toContainEqual({
                    role: 'tool',
                    toolResults: [
                        {toolCallId: 'a', toolName: 'recipe_list', result: {ok: true, data: {recipes: 1}}},
                        {toolCallId: 'b', toolName: 'project_list', result: {ok: true, data: {projects: 1}}}
                    ]
                })
            })
        })

        describe('with an unknown tool name', () => {
            it('feeds an UNKNOWN_TOOL envelope back and still lets the LLM answer', async () => {
                const unknownCall = {id: 'u', name: 'nonexistent', input: {}}
                const harness = aConversationHarness({
                    replies: [{toolCalls: [unknownCall]}, {text: 'sorry'}],
                    tools: []
                })

                await collect(harness.send$('do something'))

                expect(harness.llm.receivedMessages[1]).toContainEqual({
                    role: 'tool',
                    toolResults: [{
                        toolCallId: 'u',
                        toolName: 'nonexistent',
                        result: {ok: false, error: {code: 'UNKNOWN_TOOL', message: expect.stringContaining('nonexistent')}}
                    }]
                })
            })
        })

        describe('through the userChat seam', () => {
            const toolCall = {id: 't1', name: 'echo', input: {text: 'hi'}}

            it('broadcasts tool-start and tool-end channel events for each invocation', () => {
                const harness = aUserChatHarness({
                    conversationIds: ['conv-1'],
                    replies: [{toolCalls: [toolCall]}, {text: 'done'}],
                    tools: [{...echoSchema, invoke$: () => of({echoed: 'hi'})}]
                })
                run(harness.handle$({type: 'create-conversation'}))

                run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'echo it', ...SUB}))

                const toolEvents = harness.channelEvents.filter(event =>
                    event.kind === 'tool-start' || event.kind === 'tool-end'
                )
                expect(toolEvents).toEqual([
                    {kind: 'tool-start', targeting: 'broadcast',
                        payload: {conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', input: {text: 'hi'}}},
                    {kind: 'tool-end', targeting: 'broadcast',
                        payload: {conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', ok: true, data: {echoed: 'hi'}, error: undefined}}
                ])
            })

            it('passes the tool invocation context (conversationId + subscription + GUI context) to the tool', () => {
                const seen = []
                const harness = aUserChatHarness({
                    conversationIds: ['conv-1'],
                    replies: [{toolCalls: [toolCall]}, {text: 'done'}],
                    tools: [{...echoSchema, invoke$: (_input, context) => {
                        seen.push(context)
                        return of({})
                    }}]
                })
                run(harness.handle$({type: 'create-conversation'}))
                run(harness.handle$({type: 'context', ...SUB, guiContext: {section: 'process'}}))

                run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'echo it', ...SUB}))

                expect(seen).toEqual([{
                    conversationId: 'conv-1',
                    clientId: 'c1',
                    subscriptionId: 's1',
                    guiContext: {section: 'process'}
                }])
            })
        })
    })

    describe('directAnswer flag', () => {

        it('non-directAnswer tools always get a restate round even when the data carries an answer field', async () => {
            const listCall = {id: 'rl1', name: 'recipe_list', input: {}}
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [listCall]},
                    {text: 'You have 2 recipes.'}
                ],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => of({answer: 'specialist-style prose that should NOT stream verbatim'})
                }]
            })

            const events = await collect(harness.send$('list'))

            expect(harness.llm.receivedMessages).toHaveLength(2)
            expect(events.filter(event => event.textDelta)).toEqual([{textDelta: 'You have 2 recipes.'}])
        })
    })

    describe('runtime context across rounds', () => {
        const toolCall = {id: 't1', name: 'recipe_list', input: {}}
        const guiContext = {selectedRecipe: {recipeId: 'r1', recipeType: 'MOSAIC'}}

        function runtimeContextOf(messages) {
            return messages.find(message =>
                message.role === 'system' && /<runtime-context>/.test(message.content || '')
            )
        }

        it('the post-tool round still sees the runtime-context system message', async () => {
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [toolCall]},
                    {text: 'done.'}
                ],
                tools: [{...recipeListSchema, invoke$: () => of([])}]
            })

            await collect(harness.send$('list', {guiContext}))

            expect(runtimeContextOf(harness.llm.receivedMessages[1])?.content).toContain('"recipeId":"r1"')
        })

        it('the empty-after-tool retry round still sees the runtime-context system message', async () => {
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [toolCall]},
                    {text: ''},
                    {text: 'No tool here can do that.'}
                ],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => of({ok: false, error: {code: 'NO_MATCH', message: 'nf'}})
                }]
            })

            await collect(harness.send$('open', {guiContext}))

            expect(runtimeContextOf(harness.llm.receivedMessages[2])?.content).toContain('"recipeId":"r1"')
        })
    })

    describe('tool data collision safety', () => {

        it('treats tool result data shaped like a channel event ({kind, targeting, payload}) as data, never emitting it on the channel', async () => {
            const toolCall = {id: 'x', name: 'lookalike', input: {}}
            const lookalikeData = {kind: 'mosaic', targeting: 'whatever', payload: {foo: 1}}
            const harness = aConversationHarness({
                replies: [{toolCalls: [toolCall]}, {text: 'used the data.'}],
                tools: [{
                    name: 'lookalike',
                    description: 'Returns data that looks like a channel event.',
                    parameters: {type: 'object', properties: {}, additionalProperties: true},
                    invoke$: () => of(lookalikeData)
                }]
            })

            const events = await collect(harness.send$('use it'))

            const channelLookalikes = events.filter(event =>
                event.kind === 'mosaic' || event.targeting === 'whatever'
            )
            expect(channelLookalikes).toEqual([])
            expect(harness.llm.receivedMessages[1]).toContainEqual({
                role: 'tool',
                toolResults: [{toolCallId: 'x', toolName: 'lookalike', result: {ok: true, data: lookalikeData}}]
            })
        })
    })

    describe('get_gui_context flow', () => {

        it('lets the orchestrator call get_gui_context and feeds the cached context back as tool result data', async () => {
            const guiContextCall = {id: 'gc1', name: 'get_gui_context', input: {}}
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [guiContextCall]},
                    {text: 'You are in the process section.'}
                ],
                tools: [guiContextTool()]
            })
            const toolContext = {
                conversationId: 'conv-1', clientId: 'c1', subscriptionId: 's1',
                guiContext: {section: 'process'}
            }

            await collect(harness.send$('where am i?', {toolContext}))

            expect(harness.llm.receivedMessages[1]).toContainEqual({
                role: 'tool',
                toolResults: [{
                    toolCallId: 'gc1',
                    toolName: 'get_gui_context',
                    result: {ok: true, data: {source: 'turn_snapshot', available: true, guiContext: {section: 'process'}}}
                }]
            })
        })
    })

    describe('turn boundaries through the userChat seam', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{text: 'Hi!'}]
            })
            run(harness.handle$({type: 'create-conversation'}))
        })

        it('broadcasts a status event at the start of the turn', () => {
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB}))

            const statuses = harness.channelEvents.filter(event => event.kind === 'status')
            expect(statuses).toEqual([
                {kind: 'status', targeting: 'broadcast', payload: {conversationId: 'conv-1'}}
            ])
        })

        it('broadcasts the user message to sibling tabs (broadcastExcept) at the start of the turn', () => {
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB}))

            const userMessages = harness.channelEvents.filter(event => event.kind === 'user-message')
            expect(userMessages).toEqual([
                {kind: 'user-message', targeting: 'broadcastExcept',
                    payload: {conversationId: 'conv-1', text: 'hello'}}
            ])
        })

        it('broadcasts a chat-response complete at the end of the turn', () => {
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB}))

            const lastChatResponse = harness.channelEvents
                .filter(event => event.kind === 'chat-response').at(-1)
            expect(lastChatResponse).toEqual({
                kind: 'chat-response', targeting: 'broadcast',
                payload: {conversationId: 'conv-1', complete: true}
            })
        })

        it('records the conversation in the store before the turn runs (persists or touches up front)', async () => {
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB}))

            const persisted = await firstValue(harness.conversationsStore.list$())
            expect(persisted).toContainEqual(expect.objectContaining({id: 'conv-1'}))
        })
    })

    describe('event routing through the userChat seam', () => {
        const toolCall = {id: 't1', name: 'echo', input: {}}

        it('translates textDelta into a chat-response channel event', () => {
            const harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{text: 'one'}]
            })
            run(harness.handle$({type: 'create-conversation'}))

            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi', ...SUB}))

            expect(harness.channelEvents).toContainEqual({
                kind: 'chat-response', targeting: 'broadcast',
                payload: {conversationId: 'conv-1', text: 'one'}
            })
        })

        it('translates toolStart and toolEnd into tool-start and tool-end channel events', () => {
            const harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{toolCalls: [toolCall]}, {text: 'done'}],
                tools: [{...echoSchema, invoke$: () => of({})}]
            })
            run(harness.handle$({type: 'create-conversation'}))

            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi', ...SUB}))

            const toolEvents = harness.channelEvents.filter(event =>
                event.kind === 'tool-start' || event.kind === 'tool-end'
            )
            expect(toolEvents.map(event => event.kind)).toEqual(['tool-start', 'tool-end'])
        })

        it('unwraps a channel emission from the conversation stream and forwards the bare event', () => {
            const bareEvent = guiAction({requestId: 'req-1', action: 'echo', params: {}})
            const harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{toolCalls: [toolCall]}, {text: 'done'}],
                tools: [{...echoSchema, invoke$: () => of(emitChannel(bareEvent))}]
            })
            run(harness.handle$({type: 'create-conversation'}))

            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi', ...SUB}))

            expect(harness.channelEvents).toContainEqual(bareEvent)
        })
    })

    describe('abort persistence', () => {

        it('keeps the user message in history when the turn is aborted before any assistant text', async () => {
            const llm = aControllableLlm()
            const harness = aConversationHarness({llm})

            run(harness.send$('hello'))
            harness.conversation.abort()

            const stored = await firstValue(harness.history.load$())
            expect(stored).toEqual([{role: 'user', content: 'hello'}])
        })
    })
})
