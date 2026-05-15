const {of, throwError} = require('rxjs')
const {MAX_TOOL_ROUNDS} = require('#mcp/chat/sendMessage/conversation')
const {createToolRegistry} = require('#mcp/chat/sendMessage/tools')
const {productTools} = require('#mcp/chat/sendMessage/productTools')
const {specialistTools} = require('#mcp/chat/specialists/specialistTools')
const {aConversation, aFakeBus, aFakeGuiRequests, aFakeHistory, aFakeLlm, aFakeTools, aFakeTracer, run} = require('./builders')

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

        it('emits tool-start with the tool input and tool-end with the result data', () => {
            const {events, completed} = run(conversation.sendUserMessage$('list my recipes'))

            expect(events).toEqual([
                {toolStart: {toolCallId: toolCall.id, toolName: toolCall.name, input: toolCall.input}},
                {toolEnd: {toolCallId: toolCall.id, toolName: toolCall.name, ok: true, data: toolResult, error: undefined}},
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

    describe('projecting completed history', () => {

        it('drops a completed assistant tool-call message whose content is whitespace-only', () => {
            const llm = aFakeLlm()
            const conversation = aConversation({
                llm,
                initialMessages: [
                    {role: 'user', content: 'earlier question'},
                    {role: 'assistant', content: '  ', toolCalls: [{id: 't0', name: 'recipe_list', input: {}}]},
                    {role: 'tool', toolResults: [{toolCallId: 't0', toolName: 'recipe_list', result: {ok: true, data: []}}]},
                    {role: 'assistant', content: 'earlier answer'}
                ]
            })

            run(conversation.sendUserMessage$('next question'))

            expect(llm.receivedMessages[0]).toEqual([
                {role: 'user', content: 'earlier question'},
                {role: 'assistant', content: 'earlier answer'},
                {role: 'user', content: 'next question'}
            ])
        })
    })

    describe('post-tool LLM rounds', () => {

        it('isolates the round after a tool call from previous completed turns', () => {
            const toolCall = {id: 't1', name: 'recipe_list', input: {}}
            const llm = aFakeLlm({replies: [{toolCalls: [toolCall]}, {text: 'done'}]})
            const tools = aFakeTools({recipe_list: () => of({recipes: []})})
            const conversation = aConversation({
                llm, tools,
                systemPrompt: 'You are Sepalito.',
                initialMessages: [
                    {role: 'user', content: 'earlier question'},
                    {role: 'assistant', content: 'earlier answer'}
                ]
            })

            run(conversation.sendUserMessage$('list my recipes'))

            expect(llm.receivedMessages[1]).toEqual([
                {role: 'system', content: 'You are Sepalito.'},
                {role: 'user', content: 'list my recipes'},
                {role: 'assistant', content: '', toolCalls: [toolCall]},
                {role: 'tool', toolResults: [{toolCallId: toolCall.id, toolName: toolCall.name, result: {ok: true, data: {recipes: []}}}]}
            ])
        })
    })

    describe('list recipes after a completed list projects turn (drift regression)', () => {
        const projectCall = {id: 'pc', name: 'project_list', input: {}}
        const recipeCall = {id: 'rc', name: 'recipe_list', input: {}}
        const recipeResult = {ok: true, data: {recipes: [{id: 'r1', name: 'Mosaic'}]}}
        const listSchemas = [
            {name: 'recipe_list', description: 'r', parameters: {type: 'object'}},
            {name: 'project_list', description: 'p', parameters: {type: 'object'}}
        ]

        let llm, tools, history, conversation

        beforeEach(() => {
            llm = aFakeLlm({replies: [
                {toolCalls: [projectCall]},
                {text: 'You have 1 project.'},
                {toolCalls: [recipeCall]},
                {text: 'You have 1 recipe.'}
            ]})
            tools = aFakeTools({
                project_list: () => of({projects: [{id: 'p1', name: 'Kenya'}]}),
                recipe_list: () => of({recipes: [{id: 'r1', name: 'Mosaic'}]})
            }, listSchemas)
            history = aFakeHistory()
            conversation = aConversation({llm, tools, history})
        })

        it('still replays the completed project_list turn as plain chat on the next turn\'s first round', () => {
            run(conversation.sendUserMessage$('list my projects'))
            run(conversation.sendUserMessage$('list my recipes'))

            expect(llm.receivedMessages[2]).toEqual([
                {role: 'user', content: 'list my projects'},
                {role: 'assistant', content: 'You have 1 project.'},
                {role: 'user', content: 'list my recipes'}
            ])
        })

        it('isolates the post-recipe_list round from the previous list projects turn', () => {
            run(conversation.sendUserMessage$('list my projects'))
            run(conversation.sendUserMessage$('list my recipes'))

            expect(llm.receivedMessages[3]).toEqual([
                {role: 'user', content: 'list my recipes'},
                {role: 'assistant', content: '', toolCalls: [recipeCall]},
                {role: 'tool', toolResults: [{toolCallId: recipeCall.id, toolName: recipeCall.name, result: recipeResult}]}
            ])
        })

        it('keeps the full tool set available while isolating the post-recipe_list prompt', () => {
            run(conversation.sendUserMessage$('list my projects'))
            run(conversation.sendUserMessage$('list my recipes'))

            expect(llm.receivedTools[3].map(schema => schema.name)).toEqual(['recipe_list', 'project_list'])
        })

        it('invokes only the tool requested by each turn', () => {
            run(conversation.sendUserMessage$('list my projects'))
            run(conversation.sendUserMessage$('list my recipes'))

            expect(tools.invocations).toEqual([projectCall, recipeCall])
        })

        it('persists the full tool-call and tool-result messages for both turns', () => {
            run(conversation.sendUserMessage$('list my projects'))
            run(conversation.sendUserMessage$('list my recipes'))

            expect(history.appended).toEqual([
                {role: 'user', content: 'list my projects'},
                {role: 'assistant', content: '', toolCalls: [projectCall]},
                {role: 'tool', toolResults: [{toolCallId: projectCall.id, toolName: projectCall.name, result: {ok: true, data: {projects: [{id: 'p1', name: 'Kenya'}]}}}]},
                {role: 'assistant', content: 'You have 1 project.'},
                {role: 'user', content: 'list my recipes'},
                {role: 'assistant', content: '', toolCalls: [recipeCall]},
                {role: 'tool', toolResults: [{toolCallId: recipeCall.id, toolName: recipeCall.name, result: recipeResult}]},
                {role: 'assistant', content: 'You have 1 recipe.'}
            ])
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
        const capDisplay = {
            key: 'home.chat.notices.toolRoundCap',
            args: {max: MAX_TOOL_ROUNDS},
            fallback: expect.stringContaining('rephrasing')
        }

        let llm, tools, history, conversation
        beforeEach(() => {
            llm = aFakeLlm({replies: [{toolCalls: [toolCall]}]})
            tools = aFakeTools({recipe_list: () => of({})})
            history = aFakeHistory()
            conversation = aConversation({llm, tools, history})
        })

        it('stops the tool loop at the round cap and emits a notice event with content + display', () => {
            const {events, completed} = run(conversation.sendUserMessage$('loop forever'))

            expect(completed).toBe(true)
            expect(llm.receivedMessages).toHaveLength(MAX_TOOL_ROUNDS)
            const notice = events.find(event => event.notice)
            expect(notice).toBeDefined()
            expect(notice.notice).toEqual({
                content: expect.stringContaining('rephrasing'),
                display: capDisplay
            })
        })

        it('persists the cap notice as an assistant message carrying the display descriptor', () => {
            run(conversation.sendUserMessage$('loop forever'))

            const lastAppended = history.appended.at(-1)
            expect(lastAppended).toEqual({
                role: 'assistant',
                content: expect.stringContaining('rephrasing'),
                display: capDisplay
            })
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

    describe('with the get_context product tool', () => {

        it('lets the LLM call get_context and feeds the turn snapshot back', () => {
            const toolCall = {id: 'gc1', name: 'get_context', input: {}}
            const llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                {text: 'You are in the process section.'}
            ]})
            const tools = createToolRegistry({tools: productTools({guiRequests: aFakeGuiRequests()}), bus: aFakeBus()})
            const conversation = aConversation({llm, tools})
            const toolContext = {
                channel: {}, conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1',
                selection: {section: 'process'}
            }

            run(conversation.sendUserMessage$('where am i?', {toolContext}))

            expect(llm.receivedMessages[1]).toContainEqual({
                role: 'tool',
                toolResults: [{
                    toolCallId: 'gc1',
                    toolName: 'get_context',
                    result: {ok: true, data: {source: 'turn_snapshot', available: true, selection: {section: 'process'}}}
                }]
            })
        })
    })

    describe('with the recipe_load product tool', () => {

        it('lets the LLM call recipe_load and feeds the projected recipe back', () => {
            const toolCall = {id: 'rl1', name: 'recipe_load', input: {recipeId: 'r1'}}
            const llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                {text: 'It is a random forest classification.'}
            ]})
            const recipe = {
                id: 'r1', type: 'CLASSIFICATION', title: 'Kenya land cover', modelHash: 'hash-abc',
                model: {classifier: {type: 'RANDOM_FOREST'}}
            }
            const tools = createToolRegistry({tools: productTools({guiRequests: aFakeGuiRequests(() => of(recipe))}), bus: aFakeBus()})
            const conversation = aConversation({llm, tools})
            const toolContext = {channel: {}, conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

            run(conversation.sendUserMessage$('describe recipe r1', {toolContext}))

            expect(llm.receivedMessages[1]).toContainEqual({
                role: 'tool',
                toolResults: [{
                    toolCallId: 'rl1',
                    toolName: 'recipe_load',
                    result: {ok: true, data: {
                        id: 'r1', type: 'CLASSIFICATION', name: 'Kenya land cover', modelHash: 'hash-abc',
                        model: {classifier: {type: 'RANDOM_FOREST'}}
                    }}
                }]
            })
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
                {toolStart: {toolCallId: toolCall.id, toolName: toolCall.name, input: toolCall.input}},
                {toolEnd: {
                    toolCallId: toolCall.id, toolName: toolCall.name, ok: false,
                    data: undefined, error: {code: 'TOOL_FAILED', message: 'database unreachable'}
                }},
                {textDelta: 'Sorry, I could not list your recipes.'}
            ])
        })
    })

    describe('when the LLM delegates a map question to the map specialist', () => {
        const consultCall = {id: 'sm1', name: 'consult_map', input: {question: 'why is my map empty?'}}
        const specialistAnswer = 'No recipe is selected, so the map has no layers.'

        let llm, tools, conversation
        beforeEach(() => {
            llm = aFakeLlm({replies: [
                {toolCalls: [consultCall]},
                {text: specialistAnswer}
            ]})
            tools = aFakeTools({
                consult_map: ({question}) => of({answer: `[map] ${question}`})
            })
            conversation = aConversation({llm, tools})
        })

        it('invokes consult_map with the user question', () => {
            run(conversation.sendUserMessage$('why is my map empty?'))

            expect(tools.invocations).toEqual([consultCall])
        })

        it('feeds the specialist answer back to the main LLM as a tool result', () => {
            run(conversation.sendUserMessage$('why is my map empty?'))

            expect(llm.receivedMessages[1]).toContainEqual({
                role: 'tool',
                toolResults: [{
                    toolCallId: consultCall.id, toolName: consultCall.name,
                    result: {ok: true, data: {answer: '[map] why is my map empty?'}}
                }]
            })
        })

        it('integrates the specialist answer into the final assistant text without exposing the delegation as visible text', () => {
            const {events} = run(conversation.sendUserMessage$('why is my map empty?'))

            const textEvents = events.filter(event => event.textDelta)
            expect(textEvents).toEqual([{textDelta: specialistAnswer}])
        })
    })

    describe('when the map specialist calls a map inspection tool before answering', () => {
        const consultCall = {id: 'sm1', name: 'consult_map', input: {question: 'which areas?'}}
        const mapAreaCall = {id: 'ma1', name: 'map_area_list', input: {}}
        const mapAreaSummary = {
            recipeId: 'r1', recipeName: 'Mosaic', recipeType: 'MOSAIC',
            layout: 'single',
            areas: [{area: 'center', sourceId: 'this-recipe', sourceType: 'Recipe', sourceLabel: 'self'}]
        }

        function buildTools(llm, guiRequests) {
            const innerToolList = productTools({guiRequests})
            const innerTools = createToolRegistry({tools: innerToolList, bus: aFakeBus()})
            const specialistList = specialistTools({llm, tracer: aFakeTracer(), bus: aFakeBus(), innerTools})
            return createToolRegistry({tools: [...innerToolList, ...specialistList], bus: aFakeBus()})
        }

        it('runs the specialist inner loop, lets it call map_area_list, and surfaces the answer to the main LLM', () => {
            const llm = aFakeLlm({replies: [
                {toolCalls: [consultCall]},
                {toolCalls: [mapAreaCall]},
                {text: 'Single area, this-recipe.'},
                {text: 'You have one map area showing this recipe.'}
            ]})
            const guiRequests = aFakeGuiRequests(() => of(mapAreaSummary))
            const tools = buildTools(llm, guiRequests)
            const conversation = aConversation({llm, tools})
            const toolContext = {channel: {}, conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

            const {events} = run(conversation.sendUserMessage$('which areas?', {toolContext}))

            expect(guiRequests.requests.map(r => r.action)).toEqual(['list-map-areas'])
            const textEvents = events.filter(event => event.textDelta)
            expect(textEvents).toEqual([{textDelta: 'You have one map area showing this recipe.'}])
        })
    })
})
