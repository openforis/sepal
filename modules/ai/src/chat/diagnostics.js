// Bounded payload shaping for trace/debug bus events. Keeps log lines
// shareable by default; AI_FULL_TRACE_PAYLOADS opts into full payloads
// for deep debugging.

import crypto from 'crypto'

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

// Per-LLM-call correlation id, surfaced on llm.request + llm.usage so a log
// scanner can pair them without sequential guessing across interleaved calls.
function newCallId() {
    return crypto.randomBytes(4).toString('hex')
}

// FNV-1a 32-bit, hex slice. Stable, dependency-free, good enough to correlate
// across log lines — not cryptographic.
function shortHashOf(text) {
    if (typeof text !== 'string' || !text.length) return '-'
    let hash = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
}

// Renders a piece of user text for debug/info events: chars + hash, never
// the raw body. Returns the parts as an array so callers join into their
// own message-line shape; emits `${label}=<missing>` when value is blank.
function textChunk(label, value) {
    if (!hasVisibleText(value)) return [`${label}=<missing>`]
    return [`${label}Chars=${value.length}`, `${label}Hash=${shortHashOf(value)}`]
}

function hasVisibleText(value) {
    return typeof value === 'string' && value.trim().length > 0
}

export {createDiagnostics, MAX_DEBUG_TEXT, newCallId, shortHashOf, textChunk, truncateString}
