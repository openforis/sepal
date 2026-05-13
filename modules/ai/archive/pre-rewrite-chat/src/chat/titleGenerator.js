const log = require('#sepal/log').getLogger('titleGenerator')

const TITLE_MAX_CHARS = 80
const TITLE_SYSTEM_PROMPT = `Output a 3-7 word title summarizing the conversation. Title only — no quotes, no preamble (e.g. "Title:", "Conversation:", "Topic:"), no numbering ("1. ..."), no trailing punctuation. Be specific to what was discussed. Match the user's language.

Examples:
User asked: How do I detect NDVI change in Kenya between 2020 and 2024?
Assistant replied: [explains index change recipe]
→ NDVI change Kenya 2020-2024

User asked: ¿Cómo enmascaro las nubes en el mosaico óptico?
Assistant replied: [explains cloud masking]
→ Enmascarar nubes en mosaico óptico`

// `/no_think` is the Qwen3 family's switch to skip the <think> phase — without
// it, qwen3.5-9b spends its whole token budget thinking and emits nothing for
// short tasks like this. Most reliably honored at the end of the user message.
// Harmless on non-Qwen models (just a literal token they ignore).
const NO_THINK_SUFFIX = ' /no_think'

const QUOTE_CHARS = '"\'`'
const TRAILING_PUNCT = '.?!,:;'
// Preamble small models commonly emit despite the rules (case-insensitive).
const PREAMBLE_RE = /^(?:title|subject|conversation|topic|summary|chat|name)\s*[:\-–]\s*/i
// Numbered/bulleted list markers ("1. ", "1) ", "- ", "* ").
const LIST_MARKER_RE = /^(?:\d+[.)]\s+|[-*]\s+)/
// Thinking-mode tags some models emit inline (Qwen3, DeepSeek-R1 style). Strip
// any leading <think>...</think> so cleanTitle sees the actual answer.
const THINK_TAGS_RE = /<think>[\s\S]*?<\/think>/gi

const stripWrappingQuotes = title => {
    let result = title
    while (result.length >= 2 && QUOTE_CHARS.includes(result[0]) && result[result.length - 1] === result[0]) {
        result = result.slice(1, -1).trim()
    }
    return result
}

const stripTrailingPunctuation = title => {
    let result = title
    while (result.length && TRAILING_PUNCT.includes(result[result.length - 1])) {
        result = result.slice(0, -1).trim()
    }
    return result
}

// Strip any combination of preamble and list-marker patterns. Iterates because
// some models emit both ("1. Title: ...").
const stripPreamble = title => {
    let result = title
    let prev = null
    while (prev !== result) {
        prev = result
        result = result.replace(PREAMBLE_RE, '').replace(LIST_MARKER_RE, '').trim()
    }
    return result
}

const cleanTitle = raw => {
    if (typeof raw !== 'string') return null
    const withoutThinking = raw.replace(THINK_TAGS_RE, '').trim()
    const firstLine = withoutThinking.split('\n')[0].trim()
    const stripped = stripTrailingPunctuation(stripWrappingQuotes(stripPreamble(firstLine)))
    if (!stripped) return null
    return stripped.length > TITLE_MAX_CHARS ? stripped.substring(0, TITLE_MAX_CHARS) : stripped
}

const truncateForBaseline = text => text.length > TITLE_MAX_CHARS
    ? text.substring(0, TITLE_MAX_CHARS) + '...'
    : text

const createTitleGenerator = ({provider, conversationStore}) => {
    const broadcastConversations = async ctx => {
        const conversations = await conversationStore.listConversations({username: ctx.username})
        ctx.send({type: 'conversations', conversations})
    }

    const setBaseline = async (ctx, userText) => {
        if (!conversationStore) return
        try {
            await conversationStore.updateTitle({
                username: ctx.username,
                conversationId: ctx.conversationId,
                title: truncateForBaseline(userText)
            })
            await broadcastConversations(ctx)
        } catch (error) {
            log.error('Failed to update conversation title:', error)
        }
    }

    const refine = async (ctx, userText, assistantText) => {
        if (!provider) {
            log.debug(`[conv ${ctx.conversationId}] title refine skipped: no provider (echo mode?)`)
            return
        }
        if (!conversationStore) {
            log.debug(`[conv ${ctx.conversationId}] title refine skipped: no conversationStore`)
            return
        }
        if (!assistantText) {
            log.debug(`[conv ${ctx.conversationId}] title refine skipped: empty assistantText`)
            return
        }
        try {
            log.debug(`[conv ${ctx.conversationId}] title refine: requesting (userText=${userText.length} chars, assistantText=${assistantText.length} chars)`)
            const result = await provider.chat({
                messages: [{role: 'user', content: `User asked: ${userText}\n\nAssistant replied: ${assistantText}${NO_THINK_SUFFIX}`}],
                tools: [],
                systemPrompt: TITLE_SYSTEM_PROMPT
            })
            const raw = result?.text
            log.debug(`[conv ${ctx.conversationId}] title refine: provider returned ${JSON.stringify(raw)}`)
            const title = cleanTitle(raw)
            if (!title) {
                log.warn(`[conv ${ctx.conversationId}] title refine: cleanTitle returned null for ${JSON.stringify(raw)}; keeping baseline`)
                return
            }
            await conversationStore.updateTitle({
                username: ctx.username,
                conversationId: ctx.conversationId,
                title
            })
            await broadcastConversations(ctx)
            log.info(`[conv ${ctx.conversationId}] title refined: ${JSON.stringify(title)}`)
        } catch (error) {
            log.warn(`[conv ${ctx.conversationId}] title refine failed:`, error.message)
        }
    }

    return {setBaseline, refine}
}

module.exports = {createTitleGenerator, cleanTitle}
