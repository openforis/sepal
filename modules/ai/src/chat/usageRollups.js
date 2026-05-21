// Aggregates per-call `llm.usage` events into per-turn (`turn.usage`) and
// per-conversation (`conversation.usage`) rollups. Turns are delimited by the
// orchestrator's `conversation.send` span: usage published between its
// `.started` and `.completed`/`.failed` for a conversation belongs to that turn.
//
// Turns are serialized per conversation (the Conversation entity queues them),
// so one active turn per conversationId is a safe assumption. Usage published
// outside any active turn (e.g. title generation, which runs off the queue
// tail) still accrues to the conversation total but to no turn.

const DIMENSIONS = [
    ['byRole', event => event.role],
    ['bySpecialist', event => event.specialist],
    ['byModelProfile', event => event.modelProfile],
    ['byThinking', event => event.thinking],
    ['byProvider', event => event.provider],
    ['byModel', event => event.model]
]

function createUsageTally() {
    const totals = {
        callCount: 0,
        inputTokens: 0, outputTokens: 0, totalTokens: 0,
        cachedInputTokens: 0, cacheWriteTokens: 0,
        exactCalls: 0, estimatedCalls: 0,
        exactCacheCalls: 0, noCacheCalls: 0,
        durationMs: 0,
        maxInputBytes: 0,
        maxContextUtilization: 0
    }
    const breakdowns = Object.fromEntries(DIMENSIONS.map(([name]) => [name, {}]))

    return {add, summary}

    function add(event) {
        totals.callCount++
        totals.inputTokens += event.inputTokens || 0
        totals.outputTokens += event.outputTokens || 0
        totals.totalTokens += event.totalTokens || 0
        totals.cachedInputTokens += event.cachedInputTokens || 0
        totals.cacheWriteTokens += event.cacheWriteTokens || 0
        totals.exactCalls += event.usageExact ? 1 : 0
        totals.estimatedCalls += event.usageExact ? 0 : 1
        totals.exactCacheCalls += event.cacheUsageExact ? 1 : 0
        totals.noCacheCalls += event.cacheUsageExact ? 0 : 1
        totals.durationMs += event.durationMs || 0
        totals.maxInputBytes = Math.max(totals.maxInputBytes, event.inputBytes || 0)
        totals.maxContextUtilization = Math.max(totals.maxContextUtilization, event.contextUtilization || 0)
        DIMENSIONS.forEach(([name, keyOf]) => addToBreakdown(breakdowns[name], keyOf(event), event))
    }

    function summary() {
        return {...totals, ...breakdowns}
    }
}

// The curated log projection: unambiguous labels (inputTokens not in, exactCalls
// as exact/total, llmDurationMs) the log listener renders as `key=value`. The
// full summary still rides along on the event for programmatic consumers.
function metricsOf(summary) {
    return {
        calls: summary.callCount,
        inputTokens: summary.inputTokens,
        outputTokens: summary.outputTokens,
        totalTokens: summary.totalTokens,
        cachedInputTokens: summary.cachedInputTokens,
        exactCalls: `${summary.exactCalls}/${summary.callCount}`,
        llmDurationMs: summary.durationMs
    }
}

function addToBreakdown(breakdown, key, event) {
    if (key == null) return
    const entry = breakdown[key] || {callCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0}
    entry.callCount++
    entry.inputTokens += event.inputTokens || 0
    entry.outputTokens += event.outputTokens || 0
    entry.totalTokens += event.totalTokens || 0
    breakdown[key] = entry
}

function subscribeUsageRollups({bus}) {
    const turns = new Map()
    const conversations = new Map()

    return bus.events$.subscribe(event => {
        if (event.type === 'conversation.send.started') {
            turns.set(event.conversationId, {turnId: event.correlationId, tally: createUsageTally()})
        } else if (event.type === 'llm.usage') {
            turns.get(event.conversationId)?.tally.add(event)
            conversationTally(event.conversationId).add(event)
        } else if (event.type === 'conversation.send.completed' || event.type === 'conversation.send.failed') {
            flushTurn(event.conversationId)
        }
    })

    function conversationTally(conversationId) {
        if (!conversations.has(conversationId)) conversations.set(conversationId, createUsageTally())
        return conversations.get(conversationId)
    }

    function flushTurn(conversationId) {
        const turn = turns.get(conversationId)
        if (!turn) return
        turns.delete(conversationId)
        publishRollup('turn.usage', 'summarized', {conversationId, turnId: turn.turnId}, turn.tally.summary())
        publishRollup('conversation.usage', 'updated', {conversationId}, conversationTally(conversationId).summary())
    }

    // Structured event: the log listener default-formats type/action/context/
    // metrics into a span-consistent line; the full summary stays on the event
    // for programmatic consumers.
    function publishRollup(type, action, context, summary) {
        bus.publish({type, level: 'info', action, context, metrics: metricsOf(summary), ...summary})
    }
}

module.exports = {createUsageTally, subscribeUsageRollups}
