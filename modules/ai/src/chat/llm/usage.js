// Provider-agnostic LLM usage accounting. Works on the neutral usage shape that
// provider adapters produce — never on raw provider field names. Estimates from
// byte counts when an adapter reports no usage, and publishes the per-call
// `llm.usage` event.
//
// Neutral usage shape (produced by adapters):
//   {inputTokens, outputTokens, totalTokens, cachedInputTokens, cacheWriteTokens,
//    reasoningTokens, usageExact, cacheUsageExact}
//
// modelProfile and thinking are stable grouping dimensions with fixed defaults
// for now ('default' / 'off'); real model-profile resolution is a later slice.

const BYTES_PER_TOKEN = 4
const DEFAULT_MODEL_PROFILE = 'default'
const DEFAULT_THINKING = 'off'

function estimateUsage({inputBytes, outputText}) {
    const inputTokens = approxTokens(inputBytes)
    const outputTokens = approxTokens(byteLength(outputText))
    return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        usageExact: false,
        cacheUsageExact: false
    }
}

function resolveUsage({usage, inputBytes, outputText}) {
    return usage || estimateUsage({inputBytes, outputText})
}

function publishLlmUsage({
    bus, provider, model, role = 'unknown', specialist = null, recipeType = null,
    conversationId = null, turnId = null, callId = null, contextWindowTokens = null,
    usage: reportedUsage, outputText = '', messageBytes = 0, toolSchemaBytes = 0, durationMs = null,
    success = true, errorCode = null
}) {
    const inputBytes = messageBytes + toolSchemaBytes
    const usage = resolveUsage({usage: reportedUsage, inputBytes, outputText})
    const contextUtilization = contextWindowTokens ? usage.inputTokens / contextWindowTokens : null
    bus.publish({
        type: 'llm.usage',
        level: 'debug',
        conversationId, turnId, callId,
        role, specialist, recipeType,
        modelProfile: DEFAULT_MODEL_PROFILE,
        thinking: DEFAULT_THINKING,
        provider, model,
        contextWindowTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        reasoningTokens: usage.reasoningTokens,
        cachedInputTokens: usage.cachedInputTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        usageExact: usage.usageExact,
        cacheUsageExact: usage.cacheUsageExact,
        inputBytes, messageBytes, toolSchemaBytes,
        contextUtilization,
        durationMs,
        success,
        errorCode,
        message: () => [
            `llm.usage ${role}${specialist ? `/${specialist}` : ''}`,
            `provider=${provider} model=${model}`,
            `in=${usage.inputTokens} out=${usage.outputTokens} total=${usage.totalTokens}`,
            `cached=${usage.cachedInputTokens} cacheWrite=${usage.cacheWriteTokens}`,
            `exact=${usage.usageExact} cacheExact=${usage.cacheUsageExact}`,
            `bytes=${inputBytes} durationMs=${durationMs ?? '-'} success=${success}`
        ].join(' ')
    })
}

function approxTokens(bytes) {
    return Math.ceil((bytes || 0) / BYTES_PER_TOKEN)
}

function byteLength(text) {
    return Buffer.byteLength(text || '', 'utf8')
}

module.exports = {estimateUsage, resolveUsage, publishLlmUsage}
