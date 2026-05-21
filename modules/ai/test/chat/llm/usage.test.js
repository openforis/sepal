const {estimateUsage, resolveUsage, publishLlmUsage} = require('#mcp/chat/llm/usage')

// usage.js is provider-agnostic: it works on the neutral usage shape that
// adapters produce, never on raw provider field names.
function aNeutralUsage(overrides = {}) {
    return {
        inputTokens: 1000,
        outputTokens: 50,
        totalTokens: 1050,
        cachedInputTokens: 800,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        usageExact: true,
        cacheUsageExact: true,
        ...overrides
    }
}

describe('usage (provider-agnostic)', () => {

    describe('estimateUsage — byte/char fallback when no usage is reported', () => {

        it('estimates input and output tokens from byte counts and flags the result as inexact', () => {
            const usage = estimateUsage({inputBytes: 400, outputText: 'x'.repeat(40)})

            expect(usage).toMatchObject({
                inputTokens: 100,
                outputTokens: 10,
                totalTokens: 110,
                cachedInputTokens: 0,
                cacheWriteTokens: 0,
                reasoningTokens: 0,
                usageExact: false,
                cacheUsageExact: false
            })
        })
    })

    describe('resolveUsage — neutral usage when present, estimate otherwise', () => {

        it('uses the supplied neutral usage when available', () => {
            const usage = resolveUsage({usage: aNeutralUsage({inputTokens: 12, outputTokens: 3}), inputBytes: 9999, outputText: 'ignored'})

            expect(usage).toMatchObject({inputTokens: 12, outputTokens: 3, usageExact: true})
        })

        it('falls back to a byte estimate when no neutral usage is supplied', () => {
            const usage = resolveUsage({usage: null, inputBytes: 400, outputText: 'x'.repeat(40)})

            expect(usage).toMatchObject({inputTokens: 100, outputTokens: 10, usageExact: false})
        })
    })

    describe('publishLlmUsage — normalized per-call event', () => {

        function aRecordingBus() {
            const events = []
            return {events, publish: event => events.push(event)}
        }

        it('publishes one llm.usage event carrying call dimensions, neutral token usage, byte sizes, and timing', () => {
            const bus = aRecordingBus()

            publishLlmUsage({
                bus,
                provider: 'lmstudio',
                model: 'qwen3',
                role: 'specialist',
                specialist: 'recipe.update',
                conversationId: 'conv-1',
                usage: aNeutralUsage({inputTokens: 1000, outputTokens: 50, totalTokens: 1050, cachedInputTokens: 800}),
                outputText: 'patched.',
                messageBytes: 1200,
                toolSchemaBytes: 800,
                durationMs: 1234,
                success: true
            })

            expect(bus.events).toHaveLength(1)
            expect(bus.events[0]).toMatchObject({
                type: 'llm.usage',
                level: 'debug',
                conversationId: 'conv-1',
                role: 'specialist',
                specialist: 'recipe.update',
                provider: 'lmstudio',
                model: 'qwen3',
                modelProfile: 'default',
                thinking: 'off',
                inputTokens: 1000,
                outputTokens: 50,
                totalTokens: 1050,
                cachedInputTokens: 800,
                usageExact: true,
                cacheUsageExact: true,
                messageBytes: 1200,
                toolSchemaBytes: 800,
                inputBytes: 2000,
                durationMs: 1234,
                success: true
            })
        })

        it('estimates from byte sizes when no neutral usage is supplied', () => {
            const bus = aRecordingBus()

            publishLlmUsage({
                bus, provider: 'openai', model: 'gpt', role: 'orchestrator', conversationId: 'conv-1',
                usage: null, outputText: 'hi', messageBytes: 400, toolSchemaBytes: 0, durationMs: 5, success: true
            })

            expect(bus.events[0]).toMatchObject({usageExact: false, cacheUsageExact: false, cachedInputTokens: 0})
            expect(bus.events[0].inputTokens).toBeGreaterThan(0)
        })

        it('defaults the optional dimensions so consumers can always group by them', () => {
            const bus = aRecordingBus()

            publishLlmUsage({
                bus, provider: 'openai', model: 'gpt', role: 'orchestrator',
                conversationId: 'conv-1', usage: null, outputText: '', messageBytes: 40, toolSchemaBytes: 0,
                durationMs: 5, success: true
            })

            expect(bus.events[0]).toMatchObject({
                specialist: null,
                recipeType: null,
                turnId: null,
                callId: null,
                contextWindowTokens: null,
                contextUtilization: null,
                errorCode: null,
                reasoningTokens: 0
            })
        })

        it('carries a lazy compact log message rather than a full payload', () => {
            const bus = aRecordingBus()

            publishLlmUsage({
                bus, provider: 'openai', model: 'gpt', role: 'orchestrator', conversationId: 'conv-1',
                usage: aNeutralUsage(), outputText: 'hi', messageBytes: 40, toolSchemaBytes: 0, durationMs: 5, success: true
            })

            expect(typeof bus.events[0].message).toBe('function')
            expect(bus.events[0].message()).toMatch(/llm\.usage/)
            expect(bus.events[0].message()).toMatch(/orchestrator/)
        })
    })
})
