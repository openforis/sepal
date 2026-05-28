// LM Studio's native /api/v1/chat provider adapter. Used for tool-free calls
// that explicitly disable reasoning.

const {EMPTY, defer, finalize, from, mergeMap, tap} = require('rxjs')
const {createDiagnostics, truncateString, shortHashOf, MAX_DEBUG_TEXT} = require('../../diagnostics')
const {publishResponseSummary} = require('../events')
const {publishLlmUsage} = require('../usage')

const DEFAULT_DIAGNOSTICS = createDiagnostics()

function createLmStudioNativeChat({baseURL, apiKey, model, provider = 'lmstudio', bus, clock, diagnostics = DEFAULT_DIAGNOSTICS}) {

    return {respondTo$}

    function respondTo$({messages, maxTokens, temperature, debugLabel, usageContext}) {
        const url = nativeChatUrl(baseURL)
        const acc = {text: '', chunkCount: 0, contentChunkCount: 0, startedAt: null, error: null}
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
            acc.startedAt = clock.now()
            if (debugLabel) publishRequestEvents({bus, debugLabel, diagnostics, params})
            return from(postJson({url, apiKey, params}))
        }).pipe(
            mergeMap(response => {
                const text = textFromResponse(response)
                acc.text = text
                acc.chunkCount = text ? 1 : 0
                acc.contentChunkCount = text ? 1 : 0
                return text ? from([{textDelta: text}]) : EMPTY
            }),
            tap({error: error => { acc.error = error }}),
            publishResponseSummary({bus, diagnostics, model, acc, debugLabel}),
            finalize(() => publishUsage(acc, params, usageContext))
        )
    }

    // The native /api/v1/chat path is title-only and its usage wire shape is not
    // verified, so usage is estimated from bytes (usage: null). If LM Studio's
    // native usage shape is confirmed later, translate it here, test-first.
    function publishUsage(acc, params, usageContext) {
        const context = usageContext || {}
        publishLlmUsage({
            bus, provider, model,
            role: context.role, specialist: context.specialist, recipeType: context.recipeType,
            conversationId: context.conversationId, turnId: context.turnId, callId: context.callId,
            usage: null,
            outputText: acc.text,
            messageBytes: Buffer.byteLength(JSON.stringify([params.system_prompt, params.input]), 'utf8'),
            toolSchemaBytes: 0,
            durationMs: acc.startedAt != null ? clock.now() - acc.startedAt : null,
            success: !acc.error,
            errorCode: acc.error ? 'LLM_CALL_FAILED' : null
        })
    }
}

function publishRequestEvents({bus, debugLabel, diagnostics, params}) {
    const inputJson = stableJson(params.input)
    const systemPromptJson = stableJson(params.system_prompt)
    bus.publish({
        type: 'llm.request',
        level: 'debug',
        message: () => `LLM ${debugLabel} native LM Studio request: model=${params.model}`
            + ` inputBytes=${byteLength(inputJson)} inputHash=${shortHashOf(inputJson)}`
            + ` systemPromptBytes=${byteLength(systemPromptJson)} systemPromptHash=${shortHashOf(systemPromptJson)}`
    })
    bus.publish({
        type: 'llm.requestPayload',
        level: 'trace',
        message: () => `LLM ${debugLabel} native LM Studio request payload:`
            + ` input=${diagnostics.summarizeObject(params.input)}`
            + ` systemPrompt=${diagnostics.summarizeObject(params.system_prompt)}`
    })
}

function stableJson(value) {
    return value == null ? '' : (typeof value === 'string' ? value : JSON.stringify(value))
}

function byteLength(value) {
    return typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : 0
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
