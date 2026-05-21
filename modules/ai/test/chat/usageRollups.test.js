const {createEventBus} = require('#mcp/eventBus')
const {createUsageTally, subscribeUsageRollups} = require('#mcp/chat/usageRollups')

function anLlmUsage(overrides = {}) {
    return {
        type: 'llm.usage',
        role: 'orchestrator',
        specialist: null,
        conversationId: 'conv-1',
        provider: 'lmstudio',
        model: 'qwen3',
        modelProfile: 'default',
        thinking: 'off',
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        usageExact: true,
        cacheUsageExact: false,
        inputBytes: 400,
        contextUtilization: null,
        durationMs: 50,
        ...overrides
    }
}

describe('usage rollups', () => {

    describe('createUsageTally — aggregating per-call usage', () => {

        it('keeps input/output/total tokens separate and sums them across calls', () => {
            const tally = createUsageTally()

            tally.add(anLlmUsage({inputTokens: 100, outputTokens: 20, totalTokens: 120}))
            tally.add(anLlmUsage({inputTokens: 500, outputTokens: 30, totalTokens: 530}))

            expect(tally.summary()).toMatchObject({
                callCount: 2,
                inputTokens: 600,
                outputTokens: 50,
                totalTokens: 650
            })
        })

        it('tracks cache totals and exact-vs-estimated call counts', () => {
            const tally = createUsageTally()

            tally.add(anLlmUsage({usageExact: true, cacheUsageExact: true, cachedInputTokens: 800, cacheWriteTokens: 100}))
            tally.add(anLlmUsage({usageExact: false, cacheUsageExact: false}))

            expect(tally.summary()).toMatchObject({
                cachedInputTokens: 800,
                cacheWriteTokens: 100,
                exactCalls: 1,
                estimatedCalls: 1,
                exactCacheCalls: 1,
                noCacheCalls: 1
            })
        })

        it('sums duration and tracks the largest prompt size seen', () => {
            const tally = createUsageTally()

            tally.add(anLlmUsage({durationMs: 50, inputBytes: 400}))
            tally.add(anLlmUsage({durationMs: 70, inputBytes: 9000}))

            expect(tally.summary()).toMatchObject({durationMs: 120, maxInputBytes: 9000})
        })

        it('breaks usage down by role and by specialist', () => {
            const tally = createUsageTally()

            tally.add(anLlmUsage({role: 'orchestrator', inputTokens: 100, outputTokens: 10, totalTokens: 110}))
            tally.add(anLlmUsage({role: 'specialist', specialist: 'recipe.update', inputTokens: 500, outputTokens: 40, totalTokens: 540}))

            const summary = tally.summary()
            expect(summary.byRole.orchestrator).toMatchObject({callCount: 1, inputTokens: 100, totalTokens: 110})
            expect(summary.byRole.specialist).toMatchObject({callCount: 1, inputTokens: 500, totalTokens: 540})
            expect(summary.bySpecialist['recipe.update']).toMatchObject({callCount: 1, totalTokens: 540})
        })

        it('breaks usage down by provider, model, profile, and thinking dimensions', () => {
            const tally = createUsageTally()

            tally.add(anLlmUsage({provider: 'lmstudio', model: 'qwen3', modelProfile: 'default', thinking: 'off'}))

            const summary = tally.summary()
            expect(summary.byProvider.lmstudio).toMatchObject({callCount: 1})
            expect(summary.byModel.qwen3).toMatchObject({callCount: 1})
            expect(summary.byModelProfile.default).toMatchObject({callCount: 1})
            expect(summary.byThinking.off).toMatchObject({callCount: 1})
        })
    })

    describe('subscribeUsageRollups — turn and conversation rollups from the event bus', () => {

        function aRollupHarness() {
            const bus = createEventBus({clock: {now: () => 0}, createId: () => 'cid'})
            subscribeUsageRollups({bus})
            const rollups = []
            bus.events$.subscribe(event => {
                if (event.type === 'turn.usage' || event.type === 'conversation.usage') rollups.push(event)
            })
            return {bus, rollups}
        }

        function startTurn(bus, {conversationId, turnId}) {
            bus.publish({type: 'conversation.send.started', name: 'conversation.send', correlationId: turnId, conversationId})
        }

        function completeTurn(bus, {conversationId, turnId}) {
            bus.publish({type: 'conversation.send.completed', name: 'conversation.send', correlationId: turnId, conversationId})
        }

        it('emits one turn.usage when a turn completes, aggregating every llm.usage in that turn', () => {
            const {bus, rollups} = aRollupHarness()

            startTurn(bus, {conversationId: 'conv-1', turnId: 'turn-1'})
            bus.publish(anLlmUsage({role: 'orchestrator', conversationId: 'conv-1', inputTokens: 100, outputTokens: 10, totalTokens: 110}))
            bus.publish(anLlmUsage({role: 'specialist', specialist: 'recipe.update', conversationId: 'conv-1', inputTokens: 500, outputTokens: 40, totalTokens: 540}))
            completeTurn(bus, {conversationId: 'conv-1', turnId: 'turn-1'})

            const turnUsage = rollups.filter(event => event.type === 'turn.usage')
            expect(turnUsage).toHaveLength(1)
            expect(turnUsage[0]).toMatchObject({
                type: 'turn.usage',
                level: 'info',
                action: 'summarized',
                context: {conversationId: 'conv-1', turnId: 'turn-1'},
                metrics: {calls: 2, inputTokens: 600, outputTokens: 50, totalTokens: 650}
            })
        })

        it('publishes rollups as structured events (no hand-built message) with renamed metric labels', () => {
            const {bus, rollups} = aRollupHarness()

            startTurn(bus, {conversationId: 'conv-1', turnId: 'turn-1'})
            bus.publish(anLlmUsage({conversationId: 'conv-1', usageExact: true, durationMs: 40599}))
            completeTurn(bus, {conversationId: 'conv-1', turnId: 'turn-1'})

            const turnUsage = rollups.find(event => event.type === 'turn.usage')
            expect(turnUsage.message).toBeUndefined()
            expect(turnUsage.metrics).toMatchObject({
                calls: 1,
                cachedInputTokens: 0,
                exactCalls: '1/1',
                llmDurationMs: 40599
            })
            // The old ambiguous compact labels are gone — the metric keys carry meaning.
            expect(turnUsage.metrics).not.toHaveProperty('in')
            expect(turnUsage.metrics).not.toHaveProperty('out')
            expect(turnUsage.metrics).not.toHaveProperty('durationMs')
        })

        it('separates orchestrator and recipe.update specialist usage within the turn rollup', () => {
            const {bus, rollups} = aRollupHarness()

            startTurn(bus, {conversationId: 'conv-1', turnId: 'turn-1'})
            bus.publish(anLlmUsage({role: 'orchestrator', conversationId: 'conv-1', inputTokens: 100, totalTokens: 110}))
            bus.publish(anLlmUsage({role: 'specialist', specialist: 'recipe.update', conversationId: 'conv-1', inputTokens: 500, totalTokens: 540}))
            completeTurn(bus, {conversationId: 'conv-1', turnId: 'turn-1'})

            const turnUsage = rollups.find(event => event.type === 'turn.usage')
            // Breakdowns stay top-level structured fields for programmatic consumers.
            expect(turnUsage.byRole.orchestrator).toMatchObject({inputTokens: 100})
            expect(turnUsage.bySpecialist['recipe.update']).toMatchObject({inputTokens: 500})
        })

        it('emits a cumulative conversation.usage spanning all completed turns', () => {
            const {bus, rollups} = aRollupHarness()

            startTurn(bus, {conversationId: 'conv-1', turnId: 'turn-1'})
            bus.publish(anLlmUsage({conversationId: 'conv-1', inputTokens: 100, totalTokens: 110}))
            completeTurn(bus, {conversationId: 'conv-1', turnId: 'turn-1'})

            startTurn(bus, {conversationId: 'conv-1', turnId: 'turn-2'})
            bus.publish(anLlmUsage({conversationId: 'conv-1', inputTokens: 200, totalTokens: 220}))
            completeTurn(bus, {conversationId: 'conv-1', turnId: 'turn-2'})

            const conversationUsage = rollups.filter(event => event.type === 'conversation.usage')
            expect(conversationUsage.at(-1)).toMatchObject({
                type: 'conversation.usage',
                action: 'updated',
                context: {conversationId: 'conv-1'},
                metrics: {inputTokens: 300, totalTokens: 330}
            })
        })

        it('does not bleed usage across concurrent conversations', () => {
            const {bus, rollups} = aRollupHarness()

            startTurn(bus, {conversationId: 'conv-1', turnId: 'turn-a'})
            startTurn(bus, {conversationId: 'conv-2', turnId: 'turn-b'})
            bus.publish(anLlmUsage({conversationId: 'conv-1', inputTokens: 100, totalTokens: 110}))
            bus.publish(anLlmUsage({conversationId: 'conv-2', inputTokens: 700, totalTokens: 770}))
            completeTurn(bus, {conversationId: 'conv-1', turnId: 'turn-a'})

            const turnUsage = rollups.find(event => event.type === 'turn.usage')
            expect(turnUsage).toMatchObject({context: {conversationId: 'conv-1'}, metrics: {inputTokens: 100, calls: 1}})
        })
    })
})
