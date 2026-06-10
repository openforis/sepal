import {of} from 'rxjs'

import {guiContextTool} from '#mcp/chat/tools/guiContextTool'

import {aConversationHarness, collect, firstValue} from '../../harness.js'
import {projectListSchema, recipeListSchema} from './fixtures.js'

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

    describe('with a non-directAnswer tool whose data carries an answer field', () => {
        it('always gets a restate round (the answer field does not trigger a direct stream)', async () => {
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

    describe('with tool result data shaped like a channel event', () => {
        it('treats {kind, targeting, payload} as data, never emitting it on the channel', async () => {
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

    describe('with the get_gui_context tool', () => {
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
})
