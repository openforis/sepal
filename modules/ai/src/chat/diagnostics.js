// Bounded payload shaping for trace/debug bus events. Keeps log lines
// shareable by default; AI_FULL_TRACE_PAYLOADS opts into full payloads
// for deep debugging.

const MAX_DEBUG_TEXT = 4000

function createDiagnostics({fullPayloads = false} = {}) {
    return {
        fullPayloads,
        truncateString,
        summarizeObject,
        summarizeMessages,
        summarizeTools
    }

    function summarizeMessages(messages) {
        if (fullPayloads) return truncateString(stableJson(messages), MAX_DEBUG_TEXT)
        return stableJson((messages || []).map(summarizeMessage))
    }

    function summarizeTools(tools) {
        if (fullPayloads) return truncateString(stableJson(tools), MAX_DEBUG_TEXT)
        return stableJson((tools || []).map(summarizeTool))
    }

    function summarizeObject(value) {
        if (fullPayloads) return truncateString(stableJson(value), MAX_DEBUG_TEXT)
        return shape(value, new WeakSet())
    }
}

function truncateString(value, maxChars = MAX_DEBUG_TEXT) {
    if (typeof value !== 'string') return value
    if (value.length <= maxChars) return value
    return `${value.slice(0, maxChars)}...`
}

function summarizeMessage(message) {
    if (message.role === 'assistant' && message.toolCalls) {
        return {
            role: 'assistant',
            contentChars: contentSize(message.content),
            toolCalls: message.toolCalls.map(summarizeToolCall)
        }
    }
    if (message.role === 'tool') {
        return {
            role: 'tool',
            toolResults: (message.toolResults || []).map(summarizeToolResultRef)
        }
    }
    return {role: message.role, contentChars: contentSize(message.content)}
}

function summarizeToolCall(toolCall) {
    return {id: toolCall.id, name: toolCall.name, inputKeys: keysOf(toolCall.input)}
}

function summarizeToolResultRef({toolCallId, toolName, result}) {
    return {toolCallId, toolName, ok: result?.ok, shape: resultShape(result)}
}

function summarizeTool(tool) {
    return {
        name: tool.name,
        descriptionChars: contentSize(tool.description),
        parameterKeys: parameterKeys(tool.parameters)
    }
}

function parameterKeys(parameters) {
    if (!parameters || typeof parameters !== 'object' || !parameters.properties) return []
    return Object.keys(parameters.properties).sort()
}

function shape(value, seen) {
    if (value === null) return 'null'
    if (typeof value === 'string') return `string(${value.length})`
    if (typeof value !== 'object') return typeof value
    if (seen.has(value)) return '[circular]'
    seen.add(value)
    if (Array.isArray(value)) return `array(${value.length})`
    return `object(keys=${Object.keys(value).sort().join('|')})`
}

function resultShape(result) {
    if (!result) return 'missing'
    if (result.ok === false) return `error:${result.error?.code || 'unknown'}`
    return shape(result.data, new WeakSet())
}

function keysOf(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
    return Object.keys(value).sort()
}

function contentSize(content) {
    return typeof content === 'string' ? content.length : 0
}

function stableJson(value) {
    return JSON.stringify(stableValue(value, new WeakSet()))
}

function stableValue(value, seen) {
    if (value === null || typeof value !== 'object') return value
    if (seen.has(value)) return '[circular]'
    seen.add(value)
    if (Array.isArray(value)) return value.map(item => stableValue(item, seen))
    const sortedKeys = Object.keys(value).sort()
    const result = {}
    sortedKeys.forEach(key => { result[key] = stableValue(value[key], seen) })
    return result
}

module.exports = {createDiagnostics, truncateString, MAX_DEBUG_TEXT}
