const {of, throwError} = require('rxjs')
const {MAX_TOOL_ROUNDS} = require('#mcp/chat/conversation/conversationLoop')
const {
    aConversationHarness, aToolFactoryHarness, aUserChatHarness,
    aFakeGuiRequests, collect, firstValue, run
} = require('../harness')

describe('tool failures', () => {

    const recipeListSchema = {
        name: 'recipe_list',
        description: 'List recipes.',
        parameters: {type: 'object', properties: {}, additionalProperties: true}
    }

    describe('when a tool throws on first invocation', () => {
        const toolCall = {id: 't1', name: 'recipe_list', input: {}}
        const failingTool = {
            ...recipeListSchema,
            invoke$: () => throwError(() => new Error('database unreachable'))
        }

        let harness
        beforeEach(() => {
            harness = aConversationHarness({
                replies: [
                    {toolCalls: [toolCall]},
                    {text: 'Sorry, I could not list your recipes.'}
                ],
                tools: [failingTool]
            })
        })

        it('feeds a TOOL_FAILED envelope back to the LLM and still streams the assistant answer', async () => {
            const events = await collect(harness.send$('list my recipes'))

            const toolMessage = harness.llm.receivedMessages[1].find(m => m.role === 'tool')
            expect(toolMessage.toolResults[0].result).toEqual({
                ok: false,
                error: {code: 'TOOL_FAILED', message: 'database unreachable'}
            })
            expect(events).toContainEqual({textDelta: 'Sorry, I could not list your recipes.'})
        })

        it('emits a tool-end event carrying the failure code on the channel', async () => {
            const events = await collect(harness.send$('list my recipes'))

            expect(events).toContainEqual({
                toolEnd: {
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    ok: false,
                    data: undefined,
                    error: {code: 'TOOL_FAILED', message: 'database unreachable'}
                }
            })
        })
    })

    describe('when the LLM repeats an identical failing tool call', () => {
        const failingCall = {id: 't1', name: 'recipe_list', input: {filter: 'mine'}}
        const repeatCall = {id: 't2', name: 'recipe_list', input: {filter: 'mine'}}

        function harnessRepeating({tailReply}) {
            return aConversationHarness({
                replies: [
                    {toolCalls: [failingCall]},
                    {toolCalls: [repeatCall]},
                    tailReply
                ],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => throwError(() => new Error('boom'))
                }]
            })
        }

        it('short-circuits the repeat with TOOL_REPEAT_BLOCKED without re-invoking the tool', async () => {
            const harness = harnessRepeating({tailReply: {text: 'Giving up.'}})

            await collect(harness.send$('list my recipes'))

            expect(harness.invocations).toEqual([failingCall])
            expect(harness.llm.receivedMessages[2]).toContainEqual({
                role: 'tool',
                toolResults: [{
                    toolCallId: repeatCall.id,
                    toolName: repeatCall.name,
                    result: {ok: false, error: {code: 'TOOL_REPEAT_BLOCKED', message: expect.stringMatching(/repeat/i)}}
                }]
            })
        })

        it('does not let a blocked repeat count toward the consecutive-failure bail', async () => {
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [failingCall]},
                    {toolCalls: [repeatCall]},
                    {toolCalls: [{...failingCall, id: 't3'}]},
                    {text: 'Done complaining.'}
                ],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => throwError(() => new Error('boom'))
                }]
            })

            const events = await collect(harness.send$('list my recipes'))

            expect(events.find(event => event.notice)).toBeUndefined()
            expect(events).toContainEqual({textDelta: 'Done complaining.'})
        })
    })

    describe('when the same tool fails three times in a row with different inputs', () => {
        const aFailingCall = (id, filter) => ({id, name: 'recipe_list', input: {filter}})

        let harness
        beforeEach(() => {
            harness = aConversationHarness({
                replies: [
                    {toolCalls: [aFailingCall('a', 1)]},
                    {toolCalls: [aFailingCall('b', 2)]},
                    {toolCalls: [aFailingCall('c', 3)]},
                    {text: 'should not be reached'}
                ],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => throwError(() => new Error('boom'))
                }]
            })
        })

        it('emits a translatable consecutive-failures notice and persists it as the trailing assistant message', async () => {
            const events = await collect(harness.send$('list'))

            const noticeEvent = events.find(event => event.notice)
            expect(noticeEvent.notice.display).toEqual({
                key: 'home.chat.notices.toolConsecutiveFailures',
                args: {tool: 'recipe_list', max: 3},
                fallback: expect.any(String)
            })
            const stored = await firstValue(harness.history.load$())
            expect(stored.at(-1)).toEqual({
                role: 'assistant',
                content: expect.any(String),
                display: noticeEvent.notice.display
            })
        })
    })

    describe('when the same tool returns INVALID_TOOL_ARGS three times in a row', () => {
        const recipeLoadSchema = {
            name: 'recipe_load',
            description: 'Load one recipe.',
            parameters: {type: 'object', properties: {}, additionalProperties: true}
        }

        let harness
        beforeEach(() => {
            harness = aConversationHarness({
                replies: [
                    {toolCalls: [{id: 'a', name: 'recipe_load', input: {x: 1}}]},
                    {toolCalls: [{id: 'b', name: 'recipe_load', input: {x: 2}}]},
                    {toolCalls: [{id: 'c', name: 'recipe_load', input: {x: 3}}]},
                    {text: 'should not be reached'}
                ],
                tools: [{
                    ...recipeLoadSchema,
                    invoke$: () => of({ok: false, error: {code: 'INVALID_TOOL_ARGS', message: 'Bad args'}})
                }]
            })
        })

        it('emits the dedicated invalid-args notice and persists it as the trailing assistant message', async () => {
            const events = await collect(harness.send$('load'))

            const noticeEvent = events.find(event => event.notice)
            expect(noticeEvent.notice.display).toEqual({
                key: 'home.chat.notices.toolInvalidArgs',
                args: {tool: 'recipe_load', max: 3},
                fallback: expect.any(String)
            })
            const stored = await firstValue(harness.history.load$())
            expect(stored.at(-1)).toEqual({
                role: 'assistant',
                content: expect.any(String),
                display: noticeEvent.notice.display
            })
        })
    })

    describe('when the tool loop runs to the round cap', () => {
        const toolCall = {id: 't', name: 'recipe_list', input: {}}

        let harness
        beforeEach(() => {
            harness = aConversationHarness({
                replies: [{toolCalls: [toolCall]}],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => of({})
                }]
            })
        })

        it('emits a translatable round-cap notice and persists it as the trailing assistant message', async () => {
            const events = await collect(harness.send$('loop forever'))

            const capDisplay = {
                key: 'home.chat.notices.toolRoundCap',
                args: {max: MAX_TOOL_ROUNDS},
                fallback: expect.stringContaining('rephrasing')
            }
            expect(events.find(event => event.notice).notice).toEqual({
                content: expect.stringContaining('rephrasing'),
                display: capDisplay
            })
            const stored = await firstValue(harness.history.load$())
            expect(stored.at(-1)).toEqual({
                role: 'assistant',
                content: expect.stringContaining('rephrasing'),
                display: capDisplay
            })
        })
    })

    describe('when the post-tool LLM reply is empty', () => {
        const toolCall = {id: 't1', name: 'recipe_list', input: {}}
        const emptyReply = {text: ''}

        it('retries the LLM once with a trailing empty-after-tool system hint', async () => {
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [toolCall]},
                    emptyReply,
                    {text: 'No tool here can do that.'}
                ],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => of([])
                }]
            })

            const events = await collect(harness.send$('open the latest recipe'))

            expect(harness.llm.receivedMessages).toHaveLength(3)
            const retryMessages = harness.llm.receivedMessages[2]
            expect(retryMessages.at(-1)).toEqual({
                role: 'system',
                content: expect.stringMatching(/empty/i)
            })
            expect(events.at(-1)).toEqual({textDelta: 'No tool here can do that.'})
        })

        it('does not retry a second time when the retry itself is also empty', async () => {
            const harness = aConversationHarness({
                replies: [{toolCalls: [toolCall]}, emptyReply, emptyReply],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => of([])
                }]
            })

            await collect(harness.send$('open it'))

            expect(harness.llm.receivedMessages).toHaveLength(3)
        })

        it('invokes a tool the LLM emits on the retry after a failed tool result, with tools still available', async () => {
            const retryToolCall = {id: 't2', name: 'recipe_list', input: {type: 'MOSAIC'}}
            const failingThenOk = (() => {
                let calls = 0
                return () => of(++calls === 1
                    ? {ok: false, error: {code: 'NO_MATCH', message: 'not found'}}
                    : {ok: true, data: []})
            })()
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [toolCall]},
                    emptyReply,
                    {toolCalls: [retryToolCall]},
                    {text: 'Done.'}
                ],
                tools: [{...recipeListSchema, invoke$: failingThenOk}]
            })

            await collect(harness.send$('open it'))

            expect(harness.invocations).toEqual([toolCall, retryToolCall])
            expect(harness.llm.receivedTools[2]).toEqual([recipeListSchema])
        })
    })

    describe('when the orchestrator hits the round cap inside a userChat turn', () => {
        const toolCall = {id: 't', name: 'recipe_list', input: {}}

        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{toolCalls: [toolCall]}],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => of({})
                }]
            })
        })

        it('broadcasts a round-cap assistant-notice to the user channel', () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'spin'}))

            const notices = harness.channelEvents.filter(event => event.kind === 'assistant-notice')
            expect(notices).toEqual([{
                kind: 'assistant-notice',
                targeting: 'broadcast',
                payload: {
                    conversationId: 'conv-1',
                    content: expect.stringContaining('rephrasing'),
                    display: {
                        key: 'home.chat.notices.toolRoundCap',
                        args: {max: MAX_TOOL_ROUNDS},
                        fallback: expect.stringContaining('rephrasing')
                    }
                }
            }])
        })
    })

    describe('when constructing update_recipe without all required inner tools', () => {

        it('refuses to construct when load_for_update is missing from the inner registry', () => {
            const innerTools = innerToolsExposing(['recipe_patch'])

            expect(() => aToolFactoryHarness({specialist: 'update_recipe', innerTools}))
                .toThrow(/load_for_update/)
        })

        it('refuses to construct when recipe_patch is missing from the inner registry', () => {
            const innerTools = innerToolsExposing(['load_for_update'])

            expect(() => aToolFactoryHarness({specialist: 'update_recipe', innerTools}))
                .toThrow(/recipe_patch/)
        })
    })

    describe('when the update_recipe preflight metadata lookup fails', () => {
        let harness
        beforeEach(() => {
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('GUI gone')))
            harness = aToolFactoryHarness({specialist: 'update_recipe', guiRequests})
        })

        it('returns a failure envelope carrying the bridge error message', () => {
            const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

            expect(result).toEqual({
                ok: false,
                error: expect.objectContaining({code: 'TOOL_FAILED', message: 'GUI gone'})
            })
        })

        it('does not invoke the inner specialist LLM', () => {
            harness.invoke({recipeId: 'r1', instruction: 'edit'})

            expect(harness.llm.receivedMessages).toEqual([])
        })
    })
})

// Inner-registry double exposing only the named tool schemas, with no
// invoke$ implementations. update_recipe construction only inspects
// schemas() to verify required tools are present.
function innerToolsExposing(names) {
    const SCHEMAS = {
        load_for_update: {
            name: 'load_for_update',
            description: 'Load + closure for ONE recipe.',
            parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}}
        },
        recipe_patch: {
            name: 'recipe_patch',
            description: 'Apply JSON Patch to ONE recipe.',
            parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}
        }
    }
    return {schemas: () => names.map(name => SCHEMAS[name])}
}
