// OpenAI-compatible Chat Completions provider adapter. Unrolls the
// streamed response into {textDelta, toolCall} events for the domain.

const {EMPTY, concat, defer, filter, from, map, mergeMap, tap, timeout} = require('rxjs')
const OpenAI = require('openai').default
const {createDiagnostics} = require('../../diagnostics')
const {publishResponseSummary} = require('../events')

const FIRST_CHUNK_TIMEOUT_MS = 60_000
const BETWEEN_CHUNKS_TIMEOUT_MS = 30_000
const MAX_LENGTH_CAP_RETRIES = 1
const LENGTH_CAP_RETRY_HINT = 'RETRY: previous attempt exceeded reasoning token budget before producing an actionable response. Plan compactly; emit a complete tool call / response promptly.'
// Default output cap matches the archived openai-compatible provider's
// MAX_TOKENS=4096. Without it, LM Studio's much lower default silently
// length-caps normal chat/tool calls and the model returns reasoning-only.
const DEFAULT_MAX_TOKENS = 4096

const DEFAULT_DIAGNOSTICS = createDiagnostics()

function createOpenAiChatCompletions({baseURL, apiKey, model, bus, diagnostics = DEFAULT_DIAGNOSTICS}) {
    const client = new OpenAI({baseURL, apiKey})

    return {respondTo$}

    function respondTo$(request) {
        return attempt$(request, 0)
    }

    function attempt$({messages, tools, maxTokens, temperature, debugLabel, extraParams = {}}, attempt) {
        const acc = freshAcc()
        // Mutated inside the toolCalls$ defer and read by the retry defer below.
        // The mutation order is implicit in RxJS's sequential evaluation of
        // concat'd defers — don't reorder this pipeline.
        let retryAfterAttempt = false
        const requestMessages = attempt > 0 ? withRetryHint(messages) : messages
        const hasTools = tools?.length > 0
        const params = {
            model,
            messages: toProviderMessages(requestMessages),
            stream: true,
            ...(hasTools ? {tools: toProviderTools(tools), tool_choice: 'auto'} : {}),
            ...extraParams,
            max_tokens: maxTokens !== undefined ? maxTokens : DEFAULT_MAX_TOKENS,
            ...(temperature !== undefined ? {temperature} : {})
        }
        const text$ = defer(() => {
            if (debugLabel) {
                bus.publish({
                    type: 'llm.request',
                    level: 'debug',
                    message: () => `LLM ${debugLabel} request: model=${model} attempt=${attempt} messages=${requestMessages.length} tools=${tools?.length || 0} ${describeRequestParams(params)}`
                })
                bus.publish({
                    type: 'llm.requestPayload',
                    level: 'trace',
                    message: () => `LLM ${debugLabel} request payload: attempt=${attempt} messages=${diagnostics.summarizeMessages(requestMessages)} tools=${diagnostics.summarizeTools(tools || [])}`
                })
            }
            return from(client.chat.completions.create(params))
        }).pipe(
            mergeMap(stream => from(stream)),
            timeout({first: FIRST_CHUNK_TIMEOUT_MS, each: BETWEEN_CHUNKS_TIMEOUT_MS}),
            tap(chunk => accumulateChunk(acc, chunk)),
            map(chunk => chunk.choices?.[0]?.delta?.content),
            filter(Boolean),
            map(textDelta => ({textDelta}))
        )
        const toolCalls$ = defer(() => {
            const events = toolCallEvents(acc.toolCalls, tools || [])
            retryAfterAttempt = shouldRetryLengthCap({acc, toolCallEvents: events, attempt})
            return retryAfterAttempt ? EMPTY : from(events)
        })
        const summary$ = concat(text$, toolCalls$).pipe(publishResponseSummary({bus, diagnostics, model, acc, debugLabel, attempt}))
        return concat(
            summary$,
            defer(() => concat(
                publishLengthCap$(acc, {debugLabel, attempt, willRetry: retryAfterAttempt}),
                retryAfterAttempt ? attempt$({messages, tools, maxTokens, temperature, debugLabel, extraParams}, attempt + 1) : EMPTY
            ))
        )
    }

    function publishLengthCap$(acc, {debugLabel, attempt, willRetry}) {
        if (!acc.finishReasons.has('length')) return EMPTY
        const empty = isRuntimeEmpty(acc)
        bus.publish({
            type: 'llm.lengthCap',
            level: 'warn',
            ...(debugLabel ? {debugLabel} : {}),
            model,
            attempt,
            empty,
            willRetry,
            finishReasons: [...acc.finishReasons],
            contentChunkCount: acc.contentChunkCount,
            toolCallChunkCount: acc.toolCallChunkCount,
            reasoningChunkCount: acc.reasoningChunkCount,
            message: () => `LLM length-cap${debugLabel ? ` (${debugLabel})` : ''}: attempt=${attempt} empty=${empty} willRetry=${willRetry} content=${acc.contentChunkCount} toolCall=${acc.toolCallChunkCount} reasoning=${acc.reasoningChunkCount}`
        })
        return EMPTY
    }
}

// Reasoning-only output counts as empty for runtime purposes — the runtime
// never sees reasoning_content. Whitespace-only text is also not actionable.
function isRuntimeEmpty(acc) {
    return !acc.text.trim() && acc.toolCalls.size === 0
}

function shouldRetryLengthCap({acc, toolCallEvents, attempt}) {
    if (!acc.finishReasons.has('length')) return false
    if (attempt >= MAX_LENGTH_CAP_RETRIES) return false
    if (acc.text.trim()) return false
    return !toolCallEvents.some(isActionableToolCallEvent)
}

function isActionableToolCallEvent(event) {
    const toolCall = event.toolCall
    return toolCall && !toolCall.argsError && toolCall.input && typeof toolCall.input === 'object'
}

function withRetryHint(messages) {
    return [...messages, {role: 'system', content: LENGTH_CAP_RETRY_HINT}]
}

function freshAcc() {
    return {
        text: '',
        reasoning: '',
        chunkCount: 0,
        contentChunkCount: 0,
        reasoningChunkCount: 0,
        toolCallChunkCount: 0,
        toolCalls: new Map(),
        finishReasons: new Set(),
        deltaKeys: new Set()
    }
}

const STANDARD_PARAM_KEYS = new Set(['model', 'messages', 'stream', 'tools', 'tool_choice', 'max_tokens', 'temperature'])

function describeRequestParams(params) {
    const parts = []
    if (params.max_tokens !== undefined) parts.push(`max_tokens=${params.max_tokens}`)
    if (params.temperature !== undefined) parts.push(`temperature=${params.temperature}`)
    if (params.tool_choice !== undefined) parts.push(`tool_choice=${params.tool_choice}`)
    const extraKeys = Object.keys(params).filter(key => !STANDARD_PARAM_KEYS.has(key))
    if (extraKeys.length) parts.push(`extraParams=[${extraKeys.join(',')}]`)
    if (params.chat_template_kwargs && Object.prototype.hasOwnProperty.call(params.chat_template_kwargs, 'enable_thinking')) {
        parts.push(`enable_thinking=${params.chat_template_kwargs.enable_thinking}`)
    }
    return parts.join(' ')
}

function toProviderTools(tools) {
    return tools.map(({name, description, parameters}) => ({
        type: 'function',
        function: {name, description, parameters}
    }))
}

function toProviderMessages(messages) {
    return messages.flatMap(toProviderMessage)
}

function toProviderMessage(message) {
    const isToolCallMessage = message.role === 'assistant' && message.toolCalls
    const isToolResultMessage = message.role === 'tool'
    if (isToolCallMessage) {
        return [toProviderToolCallMessage(message)]
    } else if (isToolResultMessage) {
        return toProviderToolResultMessages(message)
    } else {
        // Strip GUI-only fields (e.g. display descriptor) — the provider
        // schema rejects extras, and the LLM only needs {role, content}.
        return [{role: message.role, content: message.content}]
    }
}

function toProviderToolCallMessage({content, toolCalls}) {
    return {
        role: 'assistant',
        content: content?.trim() ? content : null,
        tool_calls: toolCalls.map(toolCall => ({
            id: toolCall.id,
            type: 'function',
            function: {name: toolCall.name, arguments: JSON.stringify(toolCall.input ?? {})}
        }))
    }
}

// One internal tool-result message carries every result; OpenAI wants one
// role:'tool' message per result, hence the 1-to-N expansion. toolName is
// folded into the content so the model can tell which tool produced it.
function toProviderToolResultMessages({toolResults}) {
    return toolResults.map(toolResult => ({
        role: 'tool',
        tool_call_id: toolResult.toolCallId,
        content: JSON.stringify({toolName: toolResult.toolName, ...toolResult.result})
    }))
}

function accumulateChunk(acc, chunk) {
    acc.chunkCount++
    const choice = chunk.choices?.[0]
    const delta = choice?.delta
    if (choice?.finish_reason) acc.finishReasons.add(choice.finish_reason)
    Object.keys(delta || {}).forEach(key => acc.deltaKeys.add(key))
    if (typeof delta?.content === 'string') {
        acc.contentChunkCount++
        if (delta.content) acc.text += delta.content
    }
    // Thinking-mode models (qwen3, etc.) emit reasoning as a separate field.
    // Capture it for log visibility — never re-emitted to the runtime.
    if (typeof delta?.reasoning_content === 'string') {
        acc.reasoningChunkCount++
        if (delta.reasoning_content) acc.reasoning += delta.reasoning_content
    }
    if (delta?.tool_calls?.length) acc.toolCallChunkCount++
    accumulateToolCalls(acc.toolCalls, delta?.tool_calls)
}

function accumulateToolCalls(toolCalls, deltas) {
    if (!deltas) return
    for (const delta of deltas) {
        const entry = toolCalls.get(delta.index) || {id: undefined, name: undefined, args: ''}
        if (delta.id) entry.id = delta.id
        if (delta.function?.name) entry.name = delta.function.name
        if (delta.function?.arguments) entry.args += delta.function.arguments
        toolCalls.set(delta.index, entry)
    }
}

function toolCallEvents(toolCalls, tools = []) {
    const schemasByName = new Map(tools.map(tool => [tool.name, tool.parameters]))
    return [...toolCalls.values()].map(entry => {
        try {
            const input = parseToolInput(entry)
            const missing = missingRequiredArgs(input, schemasByName.get(entry.name))
            if (missing.length) {
                return {toolCall: {
                    id: entry.id,
                    name: entry.name,
                    input: null,
                    argsError: `Missing required tool arguments: ${missing.join(', ')}`
                }}
            }
            return {toolCall: {id: entry.id, name: entry.name, input}}
        } catch (error) {
            return {toolCall: {id: entry.id, name: entry.name, input: null, argsError: error.message}}
        }
    })
}

function parseToolInput(entry) {
    return entry.args?.trim() ? JSON.parse(entry.args) : {}
}

function missingRequiredArgs(input, parameters) {
    if (!parameters?.required?.length || !input || typeof input !== 'object') return []
    return parameters.required.filter(key => !Object.prototype.hasOwnProperty.call(input, key))
}

module.exports = {createOpenAiChatCompletions}
