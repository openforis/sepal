// Renders one copy-pasteable snapshot of the prompt actually sent to the LLM
// (messages + tool schemas). Wired into orchestrator.prompt and
// specialist.prompt trace-level events as a lazy `message: () => ...`, so the
// render cost only lands when log level is at trace.
//
// Per-chunk cap is its own constant — much larger than MAX_DEBUG_TEXT — so
// real system prompts + tool schemas (≈10KB MOSAIC update prompt, ≈6KB
// schema) land intact. The cap still bounds individual chunks so a runaway
// payload can't dump megabytes.

import {truncateString} from './diagnostics.js'

const MAX_SNAPSHOT_CHARS = 100_000

function renderPromptSnapshot({messages = [], tools = []}) {
    return [
        '=== messages ===',
        ...messages.map(renderMessage),
        '',
        '=== tools ===',
        tools.length === 0 ? 'tools: (none)' : tools.map(renderTool).join('\n')
    ].join('\n')
}

function renderMessage(message, index) {
    if (message.role === 'assistant' && message.toolCalls?.length) {
        return [
            `[${index}] role=assistant`,
            renderContent(message.content),
            'toolCalls:',
            ...message.toolCalls.map(renderToolCall)
        ].filter(Boolean).join('\n')
    }
    if (message.role === 'tool') {
        return [
            `[${index}] role=tool`,
            'toolResults:',
            ...(message.toolResults || []).map(renderToolResult)
        ].join('\n')
    }
    return [`[${index}] role=${message.role}`, renderContent(message.content)].filter(Boolean).join('\n')
}

function renderContent(content) {
    if (typeof content !== 'string' || content === '') return null
    return truncateString(content, MAX_SNAPSHOT_CHARS)
}

function renderToolCall(toolCall) {
    return `- id=${toolCall.id} name=${toolCall.name} input=${truncateString(JSON.stringify(toolCall.input ?? {}), MAX_SNAPSHOT_CHARS)}`
}

function renderToolResult({toolCallId, toolName, result}) {
    return `- toolCallId=${toolCallId} toolName=${toolName} ok=${result?.ok} shape=${shapeOf(result)}`
}

function shapeOf(result) {
    if (!result) return 'missing'
    if (result.ok === false) return `error:${result.error?.code || 'unknown'}`
    if (Array.isArray(result.data)) return `array(${result.data.length})`
    if (result.data && typeof result.data === 'object') return `object(keys=${Object.keys(result.data).sort().join('|')})`
    if (result.data === null || result.data === undefined) return 'null'
    return typeof result.data
}

function renderTool(tool) {
    return [
        `- name=${tool.name}`,
        `  description=${truncateString(tool.description || '', MAX_SNAPSHOT_CHARS)}`,
        `  parameters=${truncateString(JSON.stringify(tool.parameters || {}), MAX_SNAPSHOT_CHARS)}`
    ].join('\n')
}

export {renderPromptSnapshot}
