const {getLLM, buildSystemPrompt} = require('./provider')
const {createRequestContext} = require('./requestContext')
const {createRateLimiter} = require('./rateLimiter')
const {createTitleGenerator} = require('./titleGenerator')
const {createToolRunner} = require('./toolRunner')
const {runConversation, streamWithChunkBuffer, MAX_TOOL_CALL_ROUNDS} = require('./conversationLoop')

const log = require('#sepal/log').getLogger('messageHandler')

const RETRY_DELAY_MS = 2000
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const sendErrorReply = ({response, username, clientId, subscriptionId, text}) => response.send({
    username, clientId, subscriptionId,
    data: {type: 'chat-response', text, complete: true}
})

const createMessageHandler = ({response, config, registry, conversationStore, sessionStore, ephemeralConversations}) => {
    const {provider, formattedTools} = getLLM({config, registry})
    const rateLimiter = createRateLimiter({limit: config.rateLimit})
    const toolRunner = createToolRunner({registry})
    const titleGenerator = createTitleGenerator({provider, conversationStore})

    const promptBuilder = ctx => buildSystemPrompt({
        username: ctx.username,
        registry,
        selection: ctx.session.selection
    })

    const handleConversationResult = (ctx, result, {userText, isFirstUserMessage}) => {
        if (result.kind === 'done') {
            if (isFirstUserMessage) {
                titleGenerator.refine(ctx, userText, result.assistantText)
                    .catch(error => log.warn('Title refinement task failed:', error.message))
            }
        } else if (result.kind === 'bailed') {
            if (isFirstUserMessage) {
                log.info(`[conv ${ctx.conversationId}] title refine skipped: conversation bailed (${result.message})`)
            }
            ctx.sendChatResponse({text: result.message, complete: true})
        } else if (result.kind === 'cap-reached') {
            if (isFirstUserMessage) {
                log.info(`[conv ${ctx.conversationId}] title refine skipped: conversation hit ${MAX_TOOL_CALL_ROUNDS}-round cap`)
            }
            ctx.sendChatResponse({
                text: `I reached the safety cap of ${MAX_TOOL_CALL_ROUNDS} tool-call rounds. Stopping with what I have so far.`,
                complete: true
            })
        } else {
            log.error(`Unexpected conversation result: ${JSON.stringify(result)}`)
        }
    }

    // Preserves the original 429 behavior: only retries when an exception
    // escapes the entire loop, with a single non-streaming follow-up that
    // does not re-enter tool-calling. Move into a provider wrapper if we
    // ever want mid-loop retries.
    const handleLoopError = async (ctx, error) => {
        if (error.status !== 429) {
            log.error('Orchestrator error:', error)
            ctx.sendChatResponse({text: 'An error occurred while processing your message. Please try again.', complete: true})
            return
        }
        log.warn('LLM rate limited, retrying once after delay')
        try {
            await delay(RETRY_DELAY_MS)
            const retryResult = await streamWithChunkBuffer({
                provider, ctx,
                messages: ctx.messages,
                formattedTools,
                systemPrompt: promptBuilder(ctx)
            })
            const assistantMsg = {role: 'assistant', content: retryResult.text}
            ctx.messages.push(assistantMsg)
            await ctx.persistMessage(assistantMsg)
            ctx.sendChatResponse({complete: true})
        } catch (retryError) {
            log.error('LLM retry also failed:', retryError)
            ctx.sendChatResponse({text: 'The AI service is rate-limited. Please try again in a moment.', complete: true})
        }
    }

    const updateContext = ({clientId, subscriptionId, selection}) => {
        const session = sessionStore.get({clientId, subscriptionId})
        if (session) {
            session.selection = selection || null
        }
    }

    const handleMessage = async ({username, clientId, subscriptionId, text, selection}) => {
        const session = sessionStore.get({clientId, subscriptionId})
        if (!session) {
            log.warn(`No session for ${clientId}:${subscriptionId}`)
            sendErrorReply({response, username, clientId, subscriptionId, text: 'Session not found. Please close and reopen the chat.'})
            return
        }

        // The 'message' event still carries selection for backwards-compat;
        // store it as the latest known context. Subsequent 'context' events overwrite it.
        if (selection !== undefined) {
            session.selection = selection
        }

        if (!session.conversationId) {
            sendErrorReply({response, username, clientId, subscriptionId, text: 'No conversation selected. Please create or select a conversation.'})
            return
        }

        // Snapshot conversation state — isolates this request from conversation
        // switches that may happen during the async LLM loop. selectConversation
        // reassigns session.messages, so the local reference stays stable.
        const conversationId = session.conversationId
        const messages = session.messages
        const ctx = createRequestContext({
            response, conversationStore,
            username, clientId, subscriptionId,
            session, conversationId, messages
        })

        if (!rateLimiter.check(username)) {
            ctx.sendChatResponse({text: 'You are sending messages too quickly. Please wait a moment.', complete: true})
            return
        }

        if (!provider) {
            ctx.sendChatResponse({text: `Echo: ${text}`, complete: true})
            return
        }

        if (ephemeralConversations.has(conversationId) && conversationStore) {
            ephemeralConversations.delete(conversationId)
            await conversationStore.createConversation({username, id: conversationId})
        }

        const userMessage = {role: 'user', content: text}
        messages.push(userMessage)
        await ctx.persistMessage(userMessage)

        const isFirstUserMessage = messages.filter(m => m.role === 'user').length === 1
        if (isFirstUserMessage) {
            await titleGenerator.setBaseline(ctx, text)
        }

        log.info(`[conv ${conversationId}] user message (${text.length} chars), ${messages.length} prior messages`)

        try {
            const result = await runConversation({ctx, provider, formattedTools, promptBuilder, toolRunner})
            handleConversationResult(ctx, result, {userText: text, isFirstUserMessage})
        } catch (error) {
            await handleLoopError(ctx, error)
        }
    }

    return {handleMessage, updateContext}
}

module.exports = {createMessageHandler}
