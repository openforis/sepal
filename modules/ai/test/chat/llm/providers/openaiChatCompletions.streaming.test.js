import {jest} from '@jest/globals'

import {toolSchemas} from '../providerConformance.js'

const mockCreate = jest.fn()

jest.unstable_mockModule('openai', () => ({
    default: jest.fn().mockImplementation(() => ({
        chat: {completions: {create: mockCreate}}
    }))
}))

const {anOpenAiChat, collect, contentEvents} = await import('./openaiAdapterHarness.js')

describe('OpenAI adapter — streaming (provider chunks → domain events)', () => {

    beforeEach(() => mockCreate.mockReset())

    describe('chunk decoding', () => {

        it('parses a streamed tool call into a normalised toolCall event', async () => {
            mockCreate.mockResolvedValue([
                {choices: [{delta: {tool_calls: [
                    {index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"hi"}'}}
                ]}}]}
            ])

            const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

            expect(contentEvents(events)).toEqual([{toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}])
        })

        it('accumulates tool-call arguments fragmented across chunks', async () => {
            mockCreate.mockResolvedValue([
                {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"te'}}]}}]},
                {choices: [{delta: {tool_calls: [{index: 0, function: {arguments: 'xt":"hi"}'}}]}}]}
            ])

            const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

            expect(contentEvents(events)).toEqual([{toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}])
        })

        it('parses multiple tool calls in one assistant response', async () => {
            mockCreate.mockResolvedValue([
                {choices: [{delta: {tool_calls: [
                    {index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"a"}'}},
                    {index: 1, id: 'call_2', function: {name: 'echo', arguments: '{"text":"b"}'}}
                ]}}]}
            ])

            const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

            expect(contentEvents(events)).toEqual([
                {toolCall: {id: 'call_1', name: 'echo', input: {text: 'a'}}},
                {toolCall: {id: 'call_2', name: 'echo', input: {text: 'b'}}}
            ])
        })

        it('emits a toolCall with argsError when the streamed arguments are not valid JSON', async () => {
            mockCreate.mockResolvedValue([
                {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":'}}]}}]}
            ])

            const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

            expect(contentEvents(events)).toHaveLength(1)
            expect(contentEvents(events)[0].toolCall).toMatchObject({id: 'call_1', name: 'echo', input: null})
            expect(contentEvents(events)[0].toolCall.argsError).toBeDefined()
        })

        it('emits text deltas before tool calls when a response carries both', async () => {
            mockCreate.mockResolvedValue([
                {choices: [{delta: {content: 'Let me check. '}}]},
                {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"hi"}'}}]}}]}
            ])

            const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

            expect(contentEvents(events)).toEqual([
                {textDelta: 'Let me check. '},
                {toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}
            ])
        })
    })

    describe('per-call terminal responseMeta', () => {

        it('emits a responseMeta with reasoning text, char count, and finish reason so the runtime can round-trip', async () => {
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: 'planning the edit'}}]},
                {choices: [{delta: {content: 'Done.'}}]},
                {choices: [{finish_reason: 'stop', delta: {}}]}
            ])

            const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'hi'}]}))

            expect(events.at(-1)).toEqual({responseMeta: {
                reasoning: 'planning the edit',
                reasoningChars: 'planning the edit'.length,
                finishReason: 'stop'
            }})
        })

        it('reports finishReason=length on a reasoning-only length cap', async () => {
            mockCreate.mockResolvedValue([
                {choices: [{delta: {reasoning_content: 'lots of planning'}}]},
                {choices: [{finish_reason: 'length', delta: {}}]}
            ])

            const events = await collect(anOpenAiChat().respondTo$({messages: [{role: 'user', content: 'edit'}]}))

            expect(events.at(-1).responseMeta.finishReason).toBe('length')
        })
    })

    describe('length-cap retry policy', () => {

        const reasoningOnlyLengthChunks = [
            {choices: [{delta: {reasoning_content: 'planning...'}}]},
            {choices: [{delta: {reasoning_content: 'more planning...'}}]},
            {choices: [{finish_reason: 'length', delta: {}}]}
        ]

        it('retries once when finish_reason=length produced no actionable content or tool call', async () => {
            mockCreate
                .mockResolvedValueOnce(reasoningOnlyLengthChunks)
                .mockResolvedValueOnce([{choices: [{delta: {content: 'patched.'}}]}])

            const events = await collect(anOpenAiChat().respondTo$({
                messages: [{role: 'user', content: 'edit'}], debugLabel: 'recipe.update conv-1'
            }))

            expect(mockCreate).toHaveBeenCalledTimes(2)
            expect(contentEvents(events)).toEqual([{textDelta: 'patched.'}])
        })

        it('retries when the length-capped attempt emitted a tool call with missing required args', async () => {
            mockCreate
                .mockResolvedValueOnce([
                    {choices: [{delta: {tool_calls: [{index: 0, id: 'call_1', function: {name: 'echo', arguments: '{}'}}]}}]},
                    {choices: [{finish_reason: 'length', delta: {}}]}
                ])
                .mockResolvedValueOnce([{choices: [{delta: {content: 'recovered.'}}]}])

            const events = await collect(anOpenAiChat().respondTo$({
                messages: [{role: 'user', content: 'tool'}], tools: toolSchemas,
                debugLabel: 'recipe.update conv-1'
            }))

            expect(mockCreate).toHaveBeenCalledTimes(2)
            expect(contentEvents(events)).toEqual([{textDelta: 'recovered.'}])
        })

        it('caps at one retry even if the retry is itself length-capped with no actionable output', async () => {
            mockCreate
                .mockResolvedValueOnce(reasoningOnlyLengthChunks)
                .mockResolvedValueOnce(reasoningOnlyLengthChunks)

            await collect(anOpenAiChat().respondTo$({
                messages: [{role: 'user', content: 'edit'}], debugLabel: 'recipe.update conv-1'
            }))

            expect(mockCreate).toHaveBeenCalledTimes(2)
        })

        it('does not retry when length-cap was accompanied by partial content', async () => {
            mockCreate.mockResolvedValueOnce([
                {choices: [{delta: {content: 'partial '}}]},
                {choices: [{delta: {content: 'answer'}}]},
                {choices: [{finish_reason: 'length', delta: {}}]}
            ])

            const events = await collect(anOpenAiChat().respondTo$({
                messages: [{role: 'user', content: 'long'}], debugLabel: 'recipe.update conv-1'
            }))

            expect(mockCreate).toHaveBeenCalledTimes(1)
            expect(contentEvents(events)).toEqual([{textDelta: 'partial '}, {textDelta: 'answer'}])
        })

        it('does not retry when length-cap was accompanied by an actionable tool call', async () => {
            mockCreate.mockResolvedValueOnce([
                {choices: [{delta: {tool_calls: [
                    {index: 0, id: 'call_1', function: {name: 'echo', arguments: '{"text":"hi"}'}}
                ]}}]},
                {choices: [{finish_reason: 'length', delta: {}}]}
            ])

            const events = await collect(anOpenAiChat().respondTo$({
                messages: [{role: 'user', content: 'tool'}], debugLabel: 'recipe.update conv-1'
            }))

            expect(mockCreate).toHaveBeenCalledTimes(1)
            expect(contentEvents(events)).toEqual([{toolCall: {id: 'call_1', name: 'echo', input: {text: 'hi'}}}])
        })
    })
})
