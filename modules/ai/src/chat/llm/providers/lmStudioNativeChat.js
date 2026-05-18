// LM Studio's native /api/v1/chat provider adapter. Used when the
// caller disables reasoning (currently only title generation).

const {EMPTY, defer, from, mergeMap} = require('rxjs')
const {createDiagnostics, truncateString, MAX_DEBUG_TEXT} = require('../../diagnostics')
const {publishResponseSummary} = require('../events')

const DEFAULT_DIAGNOSTICS = createDiagnostics()

function createLmStudioNativeChat({baseURL, apiKey, model, bus, diagnostics = DEFAULT_DIAGNOSTICS}) {

    return {respondTo$}

    function respondTo$({messages, maxTokens, temperature, debugLabel}) {
        const url = nativeChatUrl(baseURL)
        const acc = {text: '', chunkCount: 0, contentChunkCount: 0}
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
        return defer(() => {
            if (debugLabel) {
                bus.publish({
                    type: 'llm.request',
                    level: 'debug',
                    message: () => `LLM ${debugLabel} native LM Studio request: model=${params.model} input=${diagnostics.summarizeObject(params.input)} systemPrompt=${diagnostics.summarizeObject(params.system_prompt)}`
                })
            }
            return from(postJson({url, apiKey, params}))
        }).pipe(
            mergeMap(response => {
                const text = textFromResponse(response)
                acc.text = text
                acc.chunkCount = text ? 1 : 0
                acc.contentChunkCount = text ? 1 : 0
                return text ? from([{textDelta: text}]) : EMPTY
            }),
            publishResponseSummary({bus, diagnostics, model, acc, debugLabel})
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

function nativeChatUrl(baseURL) {
    const url = new URL(baseURL)
    const pathname = url.pathname.replace(/\/+$/, '')
    url.pathname = pathname.endsWith('/v1')
        ? `${pathname.slice(0, -3)}/api/v1/chat`
        : `${pathname}/api/v1/chat`
    return url.toString()
}

async function postJson({url, apiKey, params}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: jsonHeaders(apiKey),
        body: JSON.stringify(params)
    })
    const text = await response.text()
    if (!response.ok) {
        throw new Error(`LM Studio native chat failed with ${response.status}: ${truncateString(text, MAX_DEBUG_TEXT)}`)
    }
    return text ? JSON.parse(text) : {}
}

function jsonHeaders(apiKey) {
    return {
        'Content-Type': 'application/json',
        ...(apiKey ? {Authorization: `Bearer ${apiKey}`} : {})
    }
}

function textFromResponse(response) {
    return (response.output || [])
        .filter(item => item.type === 'message')
        .map(item => item.content)
        .filter(Boolean)
        .join('')
}

module.exports = {createLmStudioNativeChat}
