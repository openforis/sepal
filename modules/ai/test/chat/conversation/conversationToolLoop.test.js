const {of, throwError} = require('rxjs')
const {MAX_TOOL_ROUNDS} = require('#mcp/chat/conversation/conversationLoop')
const {aConversation, aFakeBus, aFakeHistory, aFakeLlm, aFakeTools, run} = require('../builders')

describe('Conversation tool loop', () => {

    it('passes the available tool schemas to the LLM', () => {
        const llm = aFakeLlm()
        const schemas = [{name: 'echo', description: 'Echo.', parameters: {type: 'object'}}]
        const conversation = aConversation({llm, tools: aFakeTools({}, schemas)})

        run(conversation.sendUserMessage$('hi'))

        expect(llm.receivedTools[0]).toEqual(schemas)
    })

    it('invokes a requested tool, feeds the result back, emits tool events, and persists the full turn', () => {
        const toolCall = {id: 'recipe-list', name: 'recipe_list', input: {}}
        const toolResult = {recipes: [{id: 'r1', name: 'Mosaic'}]}
        const llm = aFakeLlm({replies: [
            {toolCalls: [toolCall]},
            {text: 'You have 1 recipe: Mosaic.'}
        ]})
        const history = aFakeHistory()
        const tools = aFakeTools({recipe_list: () => of(toolResult)})
        const conversation = aConversation({llm, tools, history})

        const {events} = run(conversation.sendUserMessage$('list my recipes'))

        const enveloped = {ok: true, data: toolResult}
        expect(tools.invocations).toEqual([toolCall])
        expect(llm.receivedMessages[1]).toEqual([
            {role: 'user', content: 'list my recipes'},
            {role: 'assistant', content: '', toolCalls: [toolCall]},
            {role: 'tool', toolResults: [{toolCallId: toolCall.id, toolName: toolCall.name, result: enveloped}]}
        ])
        expect(events).toEqual([
            {toolStart: {toolCallId: toolCall.id, toolName: toolCall.name, input: toolCall.input}},
            {toolEnd: {toolCallId: toolCall.id, toolName: toolCall.name, ok: true, data: toolResult, error: undefined}},
            {textDelta: 'You have 1 recipe: Mosaic.'}
        ])
        expect(history.appended).toEqual([
            {role: 'user', content: 'list my recipes'},
            {role: 'assistant', content: '', toolCalls: [toolCall]},
            {role: 'tool', toolResults: [{toolCallId: toolCall.id, toolName: toolCall.name, result: enveloped}]},
            {role: 'assistant', content: 'You have 1 recipe: Mosaic.'}
        ])
    })

    it('passes the turn toolContext to the invoked tool', () => {
        const toolCall = {id: 'recipe-list', name: 'recipe_list', input: {}}
        const llm = aFakeLlm({replies: [{toolCalls: [toolCall]}, {text: 'done'}]})
        const seen = []
        const tools = aFakeTools({recipe_list: (_input, context) => {
            seen.push(context)
            return of({recipes: []})
        }})
        const conversation = aConversation({llm, tools})
        const toolContext = {conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

        run(conversation.sendUserMessage$('list my recipes', {toolContext}))

        expect(seen).toEqual([toolContext])
    })

    it('invokes every tool call in one assistant response and feeds all results back together', () => {
        const callA = {id: 'a', name: 'recipe_list', input: {}}
        const callB = {id: 'b', name: 'project_list', input: {}}
        const llm = aFakeLlm({replies: [{toolCalls: [callA, callB]}, {text: 'done'}]})
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

    it('returns a structured error when the LLM asks for an unknown tool', () => {
        const unknownCall = {id: 'u', name: 'nonexistent', input: {}}
        const llm = aFakeLlm({replies: [{toolCalls: [unknownCall]}, {text: 'sorry'}]})
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

    it('returns a structured error when a tool fails and still lets the LLM answer', () => {
        const toolCall = {id: 'recipe-list', name: 'recipe_list', input: {}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [toolCall]},
            {text: 'Sorry, I could not list your recipes.'}
        ]})
        const tools = aFakeTools({recipe_list: () => throwError(() => new Error('database unreachable'))})
        const conversation = aConversation({llm, tools})

        const {events} = run(conversation.sendUserMessage$('list my recipes'))

        expect(llm.receivedMessages[1]).toContainEqual({
            role: 'tool',
            toolResults: [{
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                result: {ok: false, error: {code: 'TOOL_FAILED', message: 'database unreachable'}}
            }]
        })
        expect(events).toEqual([
            {toolStart: {toolCallId: toolCall.id, toolName: toolCall.name, input: toolCall.input}},
            {toolEnd: {
                toolCallId: toolCall.id, toolName: toolCall.name, ok: false,
                data: undefined, error: {code: 'TOOL_FAILED', message: 'database unreachable'}
            }},
            {textDelta: 'Sorry, I could not list your recipes.'}
        ])
    })

    it('logs an empty post-tool LLM reply with the preceding tool result summary when the retry also yields empty', () => {
        const toolCall = {id: 'describe', name: 'describe_recipe', input: {recipeId: 'r1'}}
        const specialistAnswer = 'I could not load the recipe details.'
        // Both the original post-tool round (1) and the retry round (2) return empty —
        // aFakeLlm clamps to the last reply, so the second {} is reused for the retry.
        const llm = aFakeLlm({replies: [
            {toolCalls: [toolCall]},
            {}
        ]})
        const bus = aFakeBus()
        const history = aFakeHistory()
        const tools = aFakeTools({describe_recipe: () => of({answer: specialistAnswer})})
        const conversation = aConversation({llm, tools, history, bus})

        const {events} = run(conversation.sendUserMessage$('open latest recipe'))

        expect(events).toEqual([
            {toolStart: {toolCallId: toolCall.id, toolName: toolCall.name, input: toolCall.input}},
            {toolEnd: {toolCallId: toolCall.id, toolName: toolCall.name, ok: true, data: {answer: specialistAnswer}, error: undefined}}
        ])
        expect(history.appended.at(-1)).toEqual({role: 'assistant', content: ''})
        expect(bus.published).toContainEqual(expect.objectContaining({
            type: 'conversation.llmEmptyReply',
            level: 'warn',
            round: 2,
            afterToolRound: true,
            toolSummary: 'describe_recipe:ok:answer(36)'
        }))
    })

    it('blocks an identical tool call after a prior failure without invoking the tool again', () => {
        const failingCall = {id: 't1', name: 'recipe_list', input: {filter: 'mine'}}
        const repeatCall = {id: 't2', name: 'recipe_list', input: {filter: 'mine'}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [failingCall]},
            {toolCalls: [repeatCall]},
            {text: 'Giving up.'}
        ]})
        const tools = aFakeTools({recipe_list: () => throwError(() => new Error('boom'))})
        const conversation = aConversation({llm, tools})

        run(conversation.sendUserMessage$('list my recipes'))

        expect(tools.invocations).toEqual([failingCall])
        expect(llm.receivedMessages[2]).toContainEqual({
            role: 'tool',
            toolResults: [{
                toolCallId: 't2',
                toolName: 'recipe_list',
                result: {ok: false, error: {code: 'TOOL_REPEAT_BLOCKED', message: expect.stringMatching(/repeat/i)}}
            }]
        })
    })

    it('bails out of the loop after consecutive failures for the same tool name', () => {
        const aFailingCall = (id, input) => ({id, name: 'recipe_list', input})
        const llm = aFakeLlm({replies: [
            {toolCalls: [aFailingCall('a', {filter: 1})]},
            {toolCalls: [aFailingCall('b', {filter: 2})]},
            {toolCalls: [aFailingCall('c', {filter: 3})]},
            {text: 'should not be reached'}
        ]})
        const tools = aFakeTools({recipe_list: () => throwError(() => new Error('boom'))})
        const history = aFakeHistory()
        const conversation = aConversation({llm, history, tools})

        const {events} = run(conversation.sendUserMessage$('list'))

        expect(tools.invocations).toHaveLength(3)
        expect(llm.receivedMessages).toHaveLength(3)
        const expectedDisplay = {
            key: 'home.chat.notices.toolConsecutiveFailures',
            args: {tool: 'recipe_list', max: 3},
            fallback: expect.any(String)
        }
        expect(events.find(event => event.notice)?.notice.display).toEqual(expectedDisplay)
        expect(history.appended.at(-1)).toEqual({
            role: 'assistant',
            content: expect.any(String),
            display: expectedDisplay
        })
    })

    it('does not count a TOOL_REPEAT_BLOCKED short-circuit toward the consecutive-failure cap', () => {
        const identicalCall = (id) => ({id, name: 'recipe_list', input: {filter: 'mine'}})
        const llm = aFakeLlm({replies: [
            {toolCalls: [identicalCall('a')]},
            {toolCalls: [identicalCall('b')]},
            {toolCalls: [identicalCall('c')]},
            {text: 'I gave up the same call.'}
        ]})
        const tools = aFakeTools({recipe_list: () => throwError(() => new Error('boom'))})
        const conversation = aConversation({llm, tools})

        const {events} = run(conversation.sendUserMessage$('list'))

        expect(tools.invocations).toHaveLength(1)
        expect(events.find(event => event.notice)).toBeUndefined()
        expect(events.at(-1)).toEqual({textDelta: 'I gave up the same call.'})
    })

    it('bails out of the loop after repeated INVALID_TOOL_ARGS for the same tool name', () => {
        const invalidArgs = () => of({ok: false, error: {code: 'INVALID_TOOL_ARGS', message: 'Bad args'}})
        const llm = aFakeLlm({replies: [
            {toolCalls: [{id: 'a', name: 'recipe_load', input: {x: 1}}]},
            {toolCalls: [{id: 'b', name: 'recipe_load', input: {x: 2}}]},
            {toolCalls: [{id: 'c', name: 'recipe_load', input: {x: 3}}]},
            {text: 'should not be reached'}
        ]})
        const tools = aFakeTools({recipe_load: invalidArgs})
        const history = aFakeHistory()
        const conversation = aConversation({llm, history, tools})

        const {events} = run(conversation.sendUserMessage$('load'))

        expect(tools.invocations).toHaveLength(3)
        expect(llm.receivedMessages).toHaveLength(3)
        const expectedDisplay = {
            key: 'home.chat.notices.toolInvalidArgs',
            args: {tool: 'recipe_load', max: 3},
            fallback: expect.any(String)
        }
        expect(events.find(event => event.notice)?.notice.display).toEqual(expectedDisplay)
        expect(history.appended.at(-1)).toEqual({
            role: 'assistant',
            content: expect.any(String),
            display: expectedDisplay
        })
    })

    it('stops a runaway tool loop at the round cap and persists a translatable notice', () => {
        const toolCall = {id: 't', name: 'recipe_list', input: {}}
        const llm = aFakeLlm({replies: [{toolCalls: [toolCall]}]})
        const history = aFakeHistory()
        const conversation = aConversation({
            llm,
            history,
            tools: aFakeTools({recipe_list: () => of({})})
        })

        const {events, completed} = run(conversation.sendUserMessage$('loop forever'))

        const capDisplay = {
            key: 'home.chat.notices.toolRoundCap',
            args: {max: MAX_TOOL_ROUNDS},
            fallback: expect.stringContaining('rephrasing')
        }
        expect(completed).toBe(true)
        expect(llm.receivedMessages).toHaveLength(MAX_TOOL_ROUNDS)
        expect(events.find(event => event.notice).notice).toEqual({
            content: expect.stringContaining('rephrasing'),
            display: capDisplay
        })
        expect(history.appended.at(-1)).toEqual({
            role: 'assistant',
            content: expect.stringContaining('rephrasing'),
            display: capDisplay
        })
    })

    describe('channel-emission collision safety', () => {

        it('treats a tool result that happens to have {kind, targeting} fields as data, not a channel emission', () => {
            const toolCall = {id: 'x', name: 'lookalike', input: {}}
            const lookalikeData = {kind: 'mosaic', targeting: 'whatever', payload: {foo: 1}}
            const llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                {text: 'used the data.'}
            ]})
            const tools = aFakeTools({lookalike: () => of(lookalikeData)})
            const conversation = aConversation({llm, tools})

            const {events} = run(conversation.sendUserMessage$('use it'))

            // tool-end carries the data through as the result envelope; no channel emission slipped past the demux.
            expect(events).toContainEqual({
                toolEnd: {toolCallId: 'x', toolName: 'lookalike', ok: true, data: lookalikeData, error: undefined}
            })
            expect(llm.receivedMessages[1].find(m => m.role === 'tool').toolResults).toEqual([
                {toolCallId: 'x', toolName: 'lookalike', result: {ok: true, data: lookalikeData}}
            ])
        })

        it('treats a tool result that fakes the streamType marker as data, not a channel emission', () => {
            // The Symbol marker is unforgeable from outside channelEvents.js, so a JSON-shaped object
            // with a string streamType field is plain data — it must NOT be promoted to a channel
            // emission and lost from the tool result.
            const toolCall = {id: 'x', name: 'lookalike', input: {}}
            const lookalikeData = {streamType: 'channel-event', event: {kind: 'gui-action'}}
            const llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                {text: 'used the data.'}
            ]})
            const tools = aFakeTools({lookalike: () => of(lookalikeData)})
            const conversation = aConversation({llm, tools})

            const {events} = run(conversation.sendUserMessage$('use it'))

            expect(events).toContainEqual({
                toolEnd: {toolCallId: 'x', toolName: 'lookalike', ok: true, data: lookalikeData, error: undefined}
            })
            expect(llm.receivedMessages[1].find(m => m.role === 'tool').toolResults).toEqual([
                {toolCallId: 'x', toolName: 'lookalike', result: {ok: true, data: lookalikeData}}
            ])
        })
    })

    describe('empty-reply retry after a tool round', () => {

        const toolCall = {id: 't1', name: 'recipe_list', input: {}}
        const emptyReply = {text: ''}

        function aLoopingToolKit({rounds, tool}) {
            const llm = aFakeLlm({replies: rounds})
            const tools = aFakeTools({recipe_list: tool})
            return {llm, tools}
        }

        it('retries once with a trailing system hint when the post-tool round produces no text or tool calls', () => {
            const {llm, tools} = aLoopingToolKit({
                rounds: [
                    {toolCalls: [toolCall]},
                    emptyReply,
                    {text: 'No tool here can do that.'}
                ],
                tool: () => of([])
            })
            const conversation = aConversation({llm, tools})

            const {events} = run(conversation.sendUserMessage$('open the latest recipe'))

            expect(llm.receivedMessages).toHaveLength(3)
            const retryMessages = llm.receivedMessages[2]
            expect(retryMessages.at(-1)).toEqual({role: 'system', content: expect.stringMatching(/empty/i)})
            expect(events.at(-1)).toEqual({textDelta: 'No tool here can do that.'})
        })

        it('does not retry a second time when the retry itself is also empty', () => {
            const {llm, tools} = aLoopingToolKit({
                rounds: [
                    {toolCalls: [toolCall]},
                    emptyReply,
                    emptyReply
                ],
                tool: () => of([])
            })
            const conversation = aConversation({llm, tools})

            run(conversation.sendUserMessage$('open it'))

            expect(llm.receivedMessages).toHaveLength(3)
        })

        it('publishes conversation.llmEmptyRetry on the retry trigger and llmEmptyReply only on a still-empty final outcome', () => {
            const bus = aFakeBus()
            const {llm, tools} = aLoopingToolKit({
                rounds: [
                    {toolCalls: [toolCall]},
                    emptyReply,
                    {text: 'No tool here can do that.'}
                ],
                tool: () => of([])
            })

            run(aConversation({llm, tools, bus}).sendUserMessage$('open it'))

            const eventTypes = bus.published.map(event => event.type)
            expect(eventTypes).toContain('conversation.llmEmptyRetry')
            expect(eventTypes).not.toContain('conversation.llmEmptyReply')
        })

        it('publishes conversation.llmEmptyReply when both rounds are empty (mitigation failed)', () => {
            const bus = aFakeBus()
            const {llm, tools} = aLoopingToolKit({
                rounds: [
                    {toolCalls: [toolCall]},
                    emptyReply,
                    emptyReply
                ],
                tool: () => of([])
            })

            run(aConversation({llm, tools, bus}).sendUserMessage$('open it'))

            const eventTypes = bus.published.map(event => event.type)
            expect(eventTypes).toContain('conversation.llmEmptyRetry')
            expect(eventTypes).toContain('conversation.llmEmptyReply')
        })

        it('does not retry when the empty round is round 0 (no prior tool result)', () => {
            const llm = aFakeLlm({replies: [emptyReply]})
            const conversation = aConversation({llm})

            run(conversation.sendUserMessage$('hi'))

            expect(llm.receivedMessages).toHaveLength(1)
        })

        it('ignores tool calls the model emits on the retry even though tools:[] was sent, and records the drop', () => {
            // Defends against providers that don't enforce tools:[] — the retry contract
            // is text-only end-to-end, not just "ask politely for text-only".
            const retryToolCall = {id: 't2', name: 'recipe_list', input: {}}
            const bus = aFakeBus()
            const llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                emptyReply,
                {text: 'Trying anyway: ', toolCalls: [retryToolCall]}
            ]})
            const tools = aFakeTools({recipe_list: () => of([])})
            const conversation = aConversation({llm, tools, bus})

            run(conversation.sendUserMessage$('open it'))

            // Initial tool call was invoked; the retry's tool call was not.
            expect(tools.invocations).toEqual([toolCall])
            // No further LLM round was triggered by the dropped tool call.
            expect(llm.receivedMessages).toHaveLength(3)
            // Diagnostic event recorded the drop.
            expect(bus.published).toContainEqual(expect.objectContaining({
                type: 'conversation.llmRetryToolCallsDropped',
                level: 'warn',
                toolNames: ['recipe_list']
            }))
        })

        it('omits tools from the retry call so the model is forced to emit text instead of substituting another read-only tool', () => {
            const schemas = [{name: 'recipe_list', description: 'd', parameters: {type: 'object'}}]
            const llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                emptyReply,
                {text: 'No tool here can do that.'}
            ]})
            const tools = aFakeTools({recipe_list: () => of([])}, schemas)
            const conversation = aConversation({llm, tools})

            run(conversation.sendUserMessage$('open it'))

            expect(llm.receivedTools[0]).toEqual(schemas)   // initial call: full tool surface
            expect(llm.receivedTools[1]).toEqual(schemas)   // post-tool empty: still full surface
            expect(llm.receivedTools[2]).toEqual([])        // retry: text-only
        })

        it('does not inject the hint on the first call after a tool round when text is present', () => {
            const {llm, tools} = aLoopingToolKit({
                rounds: [
                    {toolCalls: [toolCall]},
                    {text: 'Here is your list.'}
                ],
                tool: () => of([])
            })

            run(aConversation({llm, tools}).sendUserMessage$('list'))

            expect(llm.receivedMessages).toHaveLength(2)
            const postToolMessages = llm.receivedMessages[1]
            expect(postToolMessages.find(m => m.role === 'system' && /empty/i.test(m.content))).toBeUndefined()
        })
    })
})
