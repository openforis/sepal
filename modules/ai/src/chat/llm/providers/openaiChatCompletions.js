const {concat, defer, filter, from, map, mergeMap, tap, timeout} = require('rxjs')
const OpenAI = require('openai').default
const {truncateTo, MAX_DEBUG_TEXT} = require('../../debugText')
const {publishResponseSummary} = require('../events')

const FIRST_CHUNK_TIMEOUT_MS = 60_000
const BETWEEN_CHUNKS_TIMEOUT_MS = 30_000

function createOpenAiChatCompletions({baseURL, apiKey, model, bus}) {
    const client = new OpenAI({baseURL, apiKey})

    return {respondTo$}

    function respondTo$({messages, tools, maxTokens, temperature, debugLabel, extraParams = {}}) {
        const acc = {text: '', chunkCount: 0, toolCalls: new Map()}
        const hasTools = tools?.length > 0
        const params = {
            model,
            messages: toProviderMessages(messages),
            stream: true,
            ...(hasTools ? {tools: toProviderTools(tools), tool_choice: 'auto'} : {}),
            ...extraParams,
            ...(maxTokens !== undefined ? {max_tokens: maxTokens} : {}),
            ...(temperature !== undefined ? {temperature} : {})
        }
        const text$ = defer(() => {
            if (debugLabel) {
                bus.publish({
                    type: 'llm.request',
                    level: 'debug',
                    message: () => `LLM ${debugLabel} request params: ${JSON.stringify({...params, messages: `[${messages.length} messages]`})}`
                })
            }
            return from(client.chat.completions.create(params))
        }).pipe(
            mergeMap(stream => from(stream)),
            timeout({first: FIRST_CHUNK_TIMEOUT_MS, each: BETWEEN_CHUNKS_TIMEOUT_MS}),
            tap(chunk => {
                accumulateChunk(acc, chunk)
                bus.publish({
                    type: 'llm.chunk',
                    level: 'trace',
                    message: () => `LLM chunk ${acc.chunkCount}: ${JSON.stringify(chunk)}`
                })
                if (debugLabel) {
                    bus.publish({
                        type: 'llm.debugChunk',
                        level: 'trace',
                        message: () => `LLM ${debugLabel} raw chunk ${acc.chunkCount}: ${truncateTo(JSON.stringify(chunk), MAX_DEBUG_TEXT)}`
                    })
                }
            }),
            map(chunk => chunk.choices?.[0]?.delta?.content),
            filter(Boolean),
            map(textDelta => ({textDelta}))
        )
        const toolCalls$ = defer(() => from(toolCallEvents(acc.toolCalls)))
        return concat(text$, toolCalls$).pipe(publishResponseSummary({bus, model, acc}))
    }
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
        content: content || null,
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
    const delta = chunk.choices?.[0]?.delta
    if (delta?.content) acc.text += delta.content
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

function toolCallEvents(toolCalls) {
    return [...toolCalls.values()].map(entry => {
        try {
            return {toolCall: {id: entry.id, name: entry.name, input: JSON.parse(entry.args || '{}')}}
        } catch (error) {
            return {toolCall: {id: entry.id, name: entry.name, input: null, argsError: error.message}}
        }
    })
}

module.exports = {createOpenAiChatCompletions}
