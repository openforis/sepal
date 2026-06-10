import {jest} from '@jest/globals'

import {aRecordingBus} from '../../harness.js'
import {toolSchemas} from '../providerConformance.js'

const mockCreate = jest.fn()

jest.unstable_mockModule('openai', () => ({
    default: jest.fn().mockImplementation(() => ({
        chat: {completions: {create: mockCreate}}
    }))
}))

const {anOpenAiChat, collect} = await import('./openaiAdapterHarness.js')

describe('OpenAI adapter — llm.usage accounting', () => {

    beforeEach(() => mockCreate.mockReset())

    function aStepClock(times) {
        let i = 0
        return {now: () => times[Math.min(i++, times.length - 1)]}
    }

    const usageChunk = {choices: [], usage: {
        prompt_tokens: 1000, completion_tokens: 50, total_tokens: 1050,
        prompt_tokens_details: {cached_tokens: 800}
    }}

    it('publishes provider-reported tokens + duration + byte sizes when the stream carries a usage chunk', async () => {
        const bus = aRecordingBus()
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'patched.'}}]}, usageChunk])

        await collect(anOpenAiChat({bus, provider: 'lmstudio', clock: aStepClock([1000, 1450])}).respondTo$({
            messages: [{role: 'user', content: 'edit the recipe'}], tools: toolSchemas,
            usageContext: {role: 'specialist', specialist: 'recipe.update', conversationId: 'conv-1'}
        }))

        const usage = bus.events.find(event => event.type === 'llm.usage')
        expect(usage).toMatchObject({
            role: 'specialist', specialist: 'recipe.update', conversationId: 'conv-1',
            provider: 'lmstudio', model: 'test-model',
            inputTokens: 1000, outputTokens: 50, cachedInputTokens: 800,
            usageExact: true, cacheUsageExact: true,
            durationMs: 450, success: true
        })
        expect(usage.inputBytes).toBe(usage.messageBytes + usage.toolSchemaBytes)
    })

    it('falls back to an inexact byte-estimate when the provider streams no usage chunk', async () => {
        const bus = aRecordingBus()
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])

        await collect(anOpenAiChat({bus}).respondTo$({
            messages: [{role: 'user', content: 'hi'}],
            usageContext: {role: 'orchestrator', conversationId: 'conv-1'}
        }))

        const usage = bus.events.find(event => event.type === 'llm.usage')
        expect(usage).toMatchObject({usageExact: false, cacheUsageExact: false, cachedInputTokens: 0})
        expect(usage.inputTokens).toBeGreaterThan(0)
    })

    it('pairs each llm.usage to its matching llm.request via a shared callId, surfaced on both message lines', async () => {
        const bus = aRecordingBus()
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'patched.'}}]}, usageChunk])

        await collect(anOpenAiChat({bus, provider: 'lmstudio', clock: aStepClock([1000, 1450])}).respondTo$({
            messages: [{role: 'user', content: 'edit'}], debugLabel: 'specialist recipe.update conv-1',
            usageContext: {role: 'specialist', specialist: 'recipe.update', conversationId: 'conv-1'}
        }))

        const request = bus.events.find(event => event.type === 'llm.request')
        const usage = bus.events.find(event => event.type === 'llm.usage')
        expect(usage.callId).toBe(request.callId)
        expect(usage.message()).toMatch(/conversationId=conv-1/)
        expect(usage.message()).toMatch(new RegExp(`callId=${request.callId}`))
    })

    it('emits one llm.usage per provider call across a length-cap retry, with attribution preserved', async () => {
        const bus = aRecordingBus()
        mockCreate
            .mockResolvedValueOnce([
                {choices: [{delta: {reasoning_content: 'planning...'}}]},
                {choices: [{finish_reason: 'length', delta: {}}]}
            ])
            .mockResolvedValueOnce([{choices: [{delta: {content: 'recovered.'}}]}])

        await collect(anOpenAiChat({bus}).respondTo$({
            messages: [{role: 'user', content: 'edit'}],
            usageContext: {role: 'specialist', specialist: 'recipe.update', conversationId: 'conv-1'}
        }))

        const usage = bus.events.filter(event => event.type === 'llm.usage')
        expect(usage).toHaveLength(2)
        usage.forEach(event => expect(event).toMatchObject({
            role: 'specialist', specialist: 'recipe.update', conversationId: 'conv-1'
        }))
    })
})
