const log = require('#sepal/log').getLogger('titleGenerator')

const TITLE_MAX_CHARS = 80
const TITLE_SYSTEM_PROMPT = 'Generate a 3-7 word title summarizing what this conversation is about. Reply with the title only — no quotes, no trailing punctuation, no preamble. Be specific. Match the language of the user\'s first message.'

const QUOTE_CHARS = '"\'`'
const TRAILING_PUNCT = '.?!,:;'

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

const cleanTitle = raw => {
    if (typeof raw !== 'string') return null
    const firstLine = raw.trim().split('\n')[0].trim()
    const stripped = stripTrailingPunctuation(stripWrappingQuotes(firstLine))
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
        if (!provider || !conversationStore || !assistantText) return
        try {
            const result = await provider.chat({
                messages: [{role: 'user', content: `User asked: ${userText}\n\nAssistant replied: ${assistantText}`}],
                tools: [],
                systemPrompt: TITLE_SYSTEM_PROMPT
            })
            const title = cleanTitle(result?.text)
            if (!title) return
            await conversationStore.updateTitle({
                username: ctx.username,
                conversationId: ctx.conversationId,
                title
            })
            await broadcastConversations(ctx)
        } catch (error) {
            log.warn(`[conv ${ctx.conversationId}] title generation failed:`, error.message)
        }
    }

    return {setBaseline, refine}
}

module.exports = {createTitleGenerator, cleanTitle}
