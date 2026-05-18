const {EMPTY, catchError, concatMap, defaultIfEmpty, defer, finalize, ignoreElements, last, map, of, scan, tap, timeout} = require('rxjs')
const {titleSystemPrompt} = require('../llmText/prompts')
const {cleanTitle} = require('./cleanTitle')
const {fallbackTitle} = require('./fallbackTitle')

const TITLE_MAX_TOKENS = 32
const TITLE_TEMPERATURE = 0
const TITLE_FIRST_TEXT_TIMEOUT_MS = 10_000
const TITLE_BETWEEN_TEXT_TIMEOUT_MS = 3_000
const MAX_DEBUG_TEXT = 8000

const TITLE_SYSTEM_PROMPT = titleSystemPrompt()

// Qwen3-family models default to a thinking phase that can burn the entire
// title budget before producing visible content. The LLM adapter can disable
// reasoning per provider; /no_think remains as a harmless soft switch for
// servers/models that honor prompt-level mode changes.
const NO_THINK_SUFFIX = ' /no_think'

function createTitleGenerator({llm, conversationsStore, tracer, bus}) {
    const generating = new Set()

    return {afterTurn$}

    function afterTurn$({channel, conversation, conversationId, userText}) {
        return defer(() => {
            if (generating.has(conversationId)) return EMPTY
            const assistantText = lastAssistantText(conversation.messagesSnapshot())
            if (!assistantText) return EMPTY
            return conversationsStore.get$(conversationId).pipe(
                concatMap(meta => meta?.title
                    ? EMPTY
                    : generate$({channel, conversationId, userText, assistantText}))
            )
        })
    }

    function generate$(context) {
        return withGenerationLock$(context.conversationId, () => {
            const messages = buildTitleMessages(context)
            publishTitlePrompt(context.conversationId, messages)
            return titleGeneration$(context, messages)
        })
    }

    function titleGeneration$(context, messages) {
        return tracer.span$('title.generate', {conversationId: context.conversationId},
            titleResult$(context, messages).pipe(
                tap(result => publishRawTitle(context.conversationId, result.raw)),
                tap(result => publishFallbackUpdate(context, result)),
                concatMap(result => persistTitle$(context, result)),
                catchError(error => {
                    publishFailure(context.conversationId, error)
                    return of(emptyTitleResult())
                }),
                tap(result => publishFinished(context.conversationId, result)),
                ignoreElements()
            )
        )
    }

    function titleResult$(context, messages) {
        return titleResponse$(context.conversationId, messages).pipe(
            scan(nextLlmTitleState, emptyLlmTitleState()),
            defaultIfEmpty(emptyLlmTitleState()),
            tap(state => publishLlmUpdate(context, state)),
            last(),
            map(state => titleResultFromState(context, state))
        )
    }

    function titleResponse$(conversationId, messages) {
        return tracer.span$('title.llmRespondTo', {conversationId},
            llm.respondTo$({
                messages,
                maxTokens: TITLE_MAX_TOKENS,
                temperature: TITLE_TEMPERATURE,
                disableReasoning: true,
                debugLabel: `title ${conversationId}`
            }).pipe(
                timeout({
                    first: TITLE_FIRST_TEXT_TIMEOUT_MS,
                    each: TITLE_BETWEEN_TEXT_TIMEOUT_MS
                })
            )
        )
    }

    function persistTitle$(context, result) {
        return result.title
            ? conversationsStore.updateTitle$(context.conversationId, result.title).pipe(map(() => result))
            : of(result)
    }

    function publishLlmUpdate(context, state) {
        if (state.changed) publishTitleUpdate(context, state.title)
    }

    function publishFallbackUpdate(context, result) {
        if (result.source === 'fallback') publishTitleUpdate(context, result.title)
    }

    function publishTitlePrompt(conversationId, messages) {
        bus.publish({
            type: 'title.prompt',
            level: 'trace',
            message: () => `Title prompt for ${conversationId}: ${truncateDebug(JSON.stringify(messages))}`
        })
    }

    function publishRawTitle(conversationId, raw) {
        bus.publish({
            type: 'title.rawResponse',
            level: 'debug',
            message: () => `Title visible response for ${conversationId}: ${JSON.stringify(truncateDebug(raw))}`
        })
    }

    function publishFailure(conversationId, error) {
        bus.publish({
            type: 'title.failed',
            level: 'warn',
            message: `Title generation failed for ${conversationId}: ${error.message}`,
            error
        })
    }

    function publishFinished(conversationId, result) {
        bus.publish({
            type: result.title ? 'title.generated' : 'title.empty',
            level: 'info',
            message: result.title
                ? `Title generated for ${conversationId} (${result.source}): ${JSON.stringify(result.title)}`
                : `Title generation produced no usable title for ${conversationId}`
        })
    }

    function publishTitleUpdate({channel, conversationId}, title) {
        if (title) channel.conversationUpdated({id: conversationId, title})
    }

    function withGenerationLock$(conversationId, work$) {
        return defer(() => {
            if (!claimGeneration(conversationId)) return EMPTY
            return work$().pipe(finalize(() => generating.delete(conversationId)))
        })
    }

    function claimGeneration(conversationId) {
        if (generating.has(conversationId)) return false
        generating.add(conversationId)
        return true
    }
}

function buildTitleMessages({userText, assistantText}) {
    return [
        {role: 'system', content: TITLE_SYSTEM_PROMPT},
        {role: 'user', content: `User asked: ${userText}\n\nAssistant replied: ${assistantText}${NO_THINK_SUFFIX}`}
    ]
}

function titleResultFromState(context, state) {
    return state.title
        ? {raw: state.raw, title: state.title, source: 'llm'}
        : fallbackResult(context, state.raw)
}

function fallbackResult(context, raw) {
    const title = fallbackTitle(context)
    return title
        ? {raw, title, source: 'fallback'}
        : emptyTitleResult(raw)
}

function emptyTitleResult(raw = '') {
    return {raw, title: null, source: null}
}

function emptyLlmTitleState() {
    return {raw: '', title: null, changed: false}
}

function nextLlmTitleState(state, event) {
    const raw = state.raw + (event.textDelta || '')
    const title = cleanTitle(raw) || state.title
    return {
        raw,
        title,
        changed: Boolean(title && title !== state.title)
    }
}

function lastAssistantText(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant' && messages[i].content) return messages[i].content
    }
    return null
}

function truncateDebug(text) {
    if (text.length <= MAX_DEBUG_TEXT) return text
    return `${text.slice(0, MAX_DEBUG_TEXT)}...`
}

module.exports = {createTitleGenerator}
