const {EMPTY, defer, from, filter, finalize, map, mergeMap, tap, timeout} = require('rxjs')
const OpenAI = require('openai').default

const MAX_LOG_TEXT = 300
const MAX_DEBUG_TEXT = 4000
const FIRST_CHUNK_TIMEOUT_MS = 60_000
const BETWEEN_CHUNKS_TIMEOUT_MS = 30_000

function createOpenAI({baseURL, apiKey, model, provider, bus}) {
    const client = new OpenAI({baseURL, apiKey})

    return {respondTo$}

    function respondTo$({messages, maxTokens, temperature, debugLabel, extraParams = {}, disableReasoning = false}) {
        if (provider === 'lmstudio' && disableReasoning) {
            return respondToLmStudioNative$({messages, maxTokens, temperature, debugLabel})
        }

        const acc = {text: '', chunkCount: 0}
        const params = {
            model,
            messages,
            stream: true,
            ...extraParams,
            ...(maxTokens !== undefined ? {max_tokens: maxTokens} : {}),
            ...(temperature !== undefined ? {temperature} : {})
        }
        return defer(() => {
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
                acc.chunkCount++
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
                const delta = chunk.choices?.[0]?.delta?.content
                if (delta) acc.text += delta
            }),
            map(chunk => chunk.choices?.[0]?.delta?.content),
            filter(Boolean),
            map(textDelta => ({textDelta})),
            finalize(() => {
                bus.publish({
                    type: 'llm.response',
                    level: 'debug',
                    message: () => `LLM response: model=${model} chunks=${acc.chunkCount} text=${JSON.stringify(truncate(acc.text))}`
                })
            })
        )
    }

    function respondToLmStudioNative$({messages, maxTokens, temperature, debugLabel}) {
        const acc = {text: '', chunkCount: 0}
        const params = {
            model,
            input: nativeInput(messages),
            system_prompt: nativeSystemPrompt(messages),
            stream: false,
            store: false,
            reasoning: 'off',
            ...(maxTokens !== undefined ? {max_output_tokens: maxTokens} : {}),
            ...(temperature !== undefined ? {temperature} : {})
        }
        const url = lmStudioNativeChatUrl(baseURL)
        return defer(() => {
            if (debugLabel) {
                bus.publish({
                    type: 'llm.request',
                    level: 'debug',
                    message: () => `LLM ${debugLabel} native LM Studio request params: ${JSON.stringify(nativeRequestSummary(params))}`
                })
            }
            return from(postJson({url, apiKey, params}))
        }).pipe(
            mergeMap(response => {
                if (debugLabel) {
                    bus.publish({
                        type: 'llm.debugResponse',
                        level: 'trace',
                        message: () => `LLM ${debugLabel} native LM Studio raw response: ${truncateTo(JSON.stringify(response), MAX_DEBUG_TEXT)}`
                    })
                }
                const text = textFromNativeResponse(response)
                acc.text = text
                acc.chunkCount = text ? 1 : 0
                return text ? from([{textDelta: text}]) : EMPTY
            }),
            finalize(() => {
                bus.publish({
                    type: 'llm.response',
                    level: 'debug',
                    message: () => `LLM response: model=${model} chunks=${acc.chunkCount} text=${JSON.stringify(truncate(acc.text))}`
                })
            })
        )
    }
}

function nativeSystemPrompt(messages) {
    return messages.find(message => message.role === 'system')?.content
}

function nativeInput(messages) {
    const nonSystemMessages = messages.filter(message => message.role !== 'system')
    if (nonSystemMessages.length === 1) return nonSystemMessages[0].content
    return nonSystemMessages
        .map(message => `${message.role}: ${message.content || ''}`)
        .join('\n\n')
}

function lmStudioNativeChatUrl(baseURL) {
    const url = new URL(baseURL)
    const pathname = url.pathname.replace(/\/+$/, '')
    url.pathname = pathname.endsWith('/v1')
        ? `${pathname.slice(0, -3)}/api/v1/chat`
        : `${pathname}/api/v1/chat`
    return url.toString()
}

function nativeRequestSummary(params) {
    return {
        ...params,
        input: `[${params.input?.length || 0} chars]`,
        system_prompt: params.system_prompt ? `[${params.system_prompt.length} chars]` : undefined
    }
}

async function postJson({url, apiKey, params}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: jsonHeaders(apiKey),
        body: JSON.stringify(params)
    })
    const text = await response.text()
    if (!response.ok) {
        throw new Error(`LM Studio native chat failed with ${response.status}: ${truncateTo(text, MAX_DEBUG_TEXT)}`)
    }
    return text ? JSON.parse(text) : {}
}

function jsonHeaders(apiKey) {
    return {
        'Content-Type': 'application/json',
        ...(apiKey ? {Authorization: `Bearer ${apiKey}`} : {})
    }
}

function textFromNativeResponse(response) {
    return (response.output || [])
        .filter(item => item.type === 'message')
        .map(item => item.content)
        .filter(Boolean)
        .join('')
}

function truncate(text) {
    return truncateTo(text, MAX_LOG_TEXT)
}

function truncateTo(text, maxLength) {
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength)}...`
}

module.exports = {createOpenAI}
