const {readFileSync} = require('fs')
const {join} = require('path')
const {Subject, bufferTime, filter} = require('rxjs')
const {v4: uuid} = require('uuid')
const Ajv = require('ajv')
const log = require('#sepal/log').getLogger('orchestrator')
const {SessionStore} = require('./session')
const {ClaudeProvider} = require('./providers/claude')
const {OpenAIProvider} = require('./providers/openai')
const {LMStudioProvider} = require('./providers/lmstudio')

const SYSTEM_PROMPT_TEMPLATE = readFileSync(join(__dirname, 'system-prompt.md'), 'utf-8')

const MAX_TOOL_CALL_ROUNDS = 10
const CHUNK_BUFFER_MS = 100
const ajv = new Ajv({allErrors: true, strict: false})

const createProvider = ({llmProvider, llmApiKey, llmModel, llmBaseUrl}) => {
    switch (llmProvider) {
        case 'claude':
            return new ClaudeProvider({apiKey: llmApiKey, model: llmModel})
        case 'openai':
            return new OpenAIProvider({apiKey: llmApiKey, model: llmModel, baseUrl: llmBaseUrl})
        case 'lmstudio':
            return new LMStudioProvider({apiKey: llmApiKey, model: llmModel, baseUrl: llmBaseUrl})
        default:
            log.warn(`Unknown LLM provider "${llmProvider}", defaulting to claude`)
            return new ClaudeProvider({apiKey: llmApiKey, model: llmModel})
    }
}

const buildSystemPrompt = ({username, registry}) => {
    const recipeTypes = registry
        ? registry.listSchemas().map(s => `- **${s.name}** (${s.id}): ${s.description}`).join('\n')
        : 'No recipe schemas loaded yet.'

    return SYSTEM_PROMPT_TEMPLATE
        .replace('{{username}}', username)
        .replace('{{recipeTypes}}', recipeTypes)
}

const RETRY_DELAY_MS = 2000

const createChunkBuffer = onFlush => {
    const chunk$ = new Subject()
    const subscription = chunk$.pipe(
        bufferTime(CHUNK_BUFFER_MS),
        filter(chunks => chunks.length > 0)
    ).subscribe(chunks => onFlush(chunks.join('')))

    return {
        append: text => chunk$.next(text),
        end: () => {
            chunk$.complete()
            subscription.unsubscribe()
        }
    }
}

const createOrchestrator = ({out$, config, registry, conversationStore}) => {
    const sessions = new SessionStore({ttlMs: config.sessionTtlMs})
    const ephemeralConversations = new Set() // IDs not yet persisted to Redis
    const userRateLimits = {} // username -> {timestamps: []}
    let provider = null
    let formattedTools = []

    const initProvider = () => {
        if (config.llmApiKey) {
            provider = createProvider(config)
            log.info(`Using provider "${config.llmProvider}", model "${provider.model}"`)
            if (registry) {
                const tools = registry.listTools()
                formattedTools = provider.formatTools(tools)
                log.info(`Provider initialized: ${config.llmProvider}, ${tools.length} tools registered`)
            } else {
                log.info(`Provider initialized: ${config.llmProvider}, no tools registered`)
            }
        } else {
            log.warn('No LLM API key configured, chat will use echo mode')
        }
    }

    initProvider()

    const send = ({username, clientId, subscriptionId, data}) => {
        out$.next({username, clientId, subscriptionId, data})
    }

    const broadcast = ({username, excludeClientId, data}) => {
        out$.next({username, excludeClientId, data})
    }

    const isRateLimited = (username, rateLimit) => {
        const now = Date.now()
        const windowMs = 60 * 1000
        if (!userRateLimits[username]) {
            userRateLimits[username] = {timestamps: []}
        }
        const entry = userRateLimits[username]
        entry.timestamps = entry.timestamps.filter(t => now - t < windowMs)
        if (entry.timestamps.length >= rateLimit) {
            return true
        }
        entry.timestamps.push(now)
        return false
    }

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

    const validateParams = (toolName, params, schema) => {
        if (!schema || !schema.properties) {
            return null
        }
        const validate = ajv.compile(schema)
        if (!validate(params || {})) {
            const errors = validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; ')
            log.warn(`Tool ${toolName} parameter validation failed: ${errors}`)
            return errors
        }
        return null
    }

    const executeToolCalls = async ({toolCalls, username, session, sendFn}) => {
        const results = []
        for (const tc of toolCalls) {
            const tool = registry ? registry.getTool(tc.name) : null
            if (tool) {
                const validationError = validateParams(tc.name, tc.input, tool.parameters)
                if (validationError) {
                    results.push({
                        toolCallId: tc.id, name: tc.name,
                        result: {success: false, error: {code: 'VALIDATION_ERROR', message: `Invalid parameters: ${validationError}`}}
                    })
                } else {
                    try {
                        log.debug(`Executing tool: ${tc.name}`)
                        const result = await tool.handler({username, params: tc.input || {}, send: sendFn, session})
                        results.push({toolCallId: tc.id, name: tc.name, result})
                    } catch (error) {
                        log.error(`Tool ${tc.name} error:`, error)
                        results.push({
                            toolCallId: tc.id, name: tc.name,
                            result: {success: false, error: {code: 'TOOL_ERROR', message: error.message}}
                        })
                    }
                }
            } else {
                log.warn(`Unknown tool: ${tc.name}`)
                results.push({
                    toolCallId: tc.id, name: tc.name,
                    result: {success: false, error: {code: 'UNKNOWN_TOOL', message: `Unknown tool: ${tc.name}`}}
                })
            }
        }
        return results
    }

    const persistMessage = async ({username, conversationId, message}) => {
        if (conversationStore && conversationId) {
            try {
                await conversationStore.appendMessage({username, conversationId, message})
            } catch (error) {
                log.error('Failed to persist message:', error)
            }
        }
    }

    const handleMessage = async ({username, clientId, subscriptionId, text}) => {
        const session = sessions.get({clientId, subscriptionId})
        if (!session) {
            log.warn(`No session for ${clientId}:${subscriptionId}`)
            send({
                username, clientId, subscriptionId,
                data: {type: 'chat-response', text: 'Session not found. Please close and reopen the chat.', complete: true}
            })
            return
        }

        if (!session.conversationId) {
            send({
                username, clientId, subscriptionId,
                data: {type: 'chat-response', text: 'No conversation selected. Please create or select a conversation.', complete: true}
            })
            return
        }

        // Snapshot conversation state at message time — isolates this request
        // from conversation switches that may happen during the async LLM loop.
        // selectConversation reassigns session.messages to a new array, so the
        // local reference remains stable for this request's lifetime.
        const conversationId = session.conversationId
        const messages = session.messages

        if (isRateLimited(username, config.rateLimit)) {
            send({
                username, clientId, subscriptionId,
                data: {type: 'chat-response', conversationId, text: 'You are sending messages too quickly. Please wait a moment.', complete: true}
            })
            return
        }

        // Echo mode if no provider configured
        if (!provider) {
            send({
                username, clientId, subscriptionId,
                data: {type: 'chat-response', conversationId, text: `Echo: ${text}`, complete: true}
            })
            return
        }

        // Persist ephemeral conversation to Redis on first message
        if (ephemeralConversations.has(conversationId) && conversationStore) {
            ephemeralConversations.delete(conversationId)
            await conversationStore.createConversation({username, id: conversationId})
        }

        const userMessage = {role: 'user', content: text}
        messages.push(userMessage)
        await persistMessage({username, conversationId, message: userMessage})

        // Auto-generate title from first user message
        if (messages.filter(m => m.role === 'user').length === 1 && conversationStore) {
            const title = text.length > 80 ? text.substring(0, 80) + '...' : text
            try {
                await conversationStore.updateTitle({username, conversationId, title})
                const conversations = await conversationStore.listConversations({username})
                send({username, clientId, subscriptionId, data: {type: 'conversations', conversations}})
            } catch (error) {
                log.error('Failed to update conversation title:', error)
            }
        }

        send({username, clientId, subscriptionId, data: {type: 'status', conversationId, status: 'thinking'}})

        const systemPrompt = buildSystemPrompt({username, registry})
        const sendFn = data => send({username, clientId, subscriptionId, data})

        try {
            let rounds = 0
            let done = false

            while (!done && rounds < MAX_TOOL_CALL_ROUNDS) {
                rounds++

                const chunkBuffer = createChunkBuffer(text => send({
                    username, clientId, subscriptionId,
                    data: {type: 'chat-response', conversationId, text}
                }))

                const result = await provider.stream({
                    messages,
                    tools: formattedTools,
                    systemPrompt,
                    onChunk: chunk => chunkBuffer.append(chunk)
                })

                chunkBuffer.end()

                if (result.toolCalls && result.toolCalls.length > 0) {
                    const assistantMsg = {
                        role: 'assistant',
                        content: result.text,
                        toolCalls: result.toolCalls
                    }
                    messages.push(assistantMsg)
                    await persistMessage({username, conversationId, message: assistantMsg})

                    send({
                        username, clientId, subscriptionId,
                        data: {type: 'tool-use', conversationId, tools: result.toolCalls.map(tc => tc.name)}
                    })

                    const toolResults = await executeToolCalls({
                        toolCalls: result.toolCalls,
                        username,
                        session,
                        sendFn
                    })

                    const toolMsg = {role: 'tool', toolResults}
                    messages.push(toolMsg)
                    await persistMessage({username, conversationId, message: toolMsg})
                } else {
                    const assistantMsg = {role: 'assistant', content: result.text}
                    messages.push(assistantMsg)
                    await persistMessage({username, conversationId, message: assistantMsg})
                    send({
                        username, clientId, subscriptionId,
                        data: {type: 'chat-response', conversationId, complete: true}
                    })
                    done = true
                }
            }

            if (!done) {
                const msg = 'I reached the maximum number of tool call rounds. Here is what I have so far.'
                send({
                    username, clientId, subscriptionId,
                    data: {type: 'chat-response', conversationId, text: msg, complete: true}
                })
            }
        } catch (error) {
            if (error.status === 429) {
                log.warn('LLM rate limited, retrying once after delay')
                try {
                    await delay(RETRY_DELAY_MS)
                    const retryChunkBuffer = createChunkBuffer(text => send({
                        username, clientId, subscriptionId,
                        data: {type: 'chat-response', conversationId, text}
                    }))
                    const retryResult = await provider.stream({
                        messages,
                        tools: formattedTools,
                        systemPrompt,
                        onChunk: chunk => retryChunkBuffer.append(chunk)
                    })
                    retryChunkBuffer.end()
                    const assistantMsg = {role: 'assistant', content: retryResult.text}
                    messages.push(assistantMsg)
                    await persistMessage({username, conversationId, message: assistantMsg})
                    send({
                        username, clientId, subscriptionId,
                        data: {type: 'chat-response', conversationId, complete: true}
                    })
                } catch (retryError) {
                    log.error('LLM retry also failed:', retryError)
                    send({
                        username, clientId, subscriptionId,
                        data: {type: 'chat-response', conversationId, text: 'The AI service is rate-limited. Please try again in a moment.', complete: true}
                    })
                }
            } else {
                log.error('Orchestrator error:', error)
                send({
                    username, clientId, subscriptionId,
                    data: {type: 'chat-response', conversationId, text: 'An error occurred while processing your message. Please try again.', complete: true}
                })
            }
        }
    }

    const listConversations = async ({username, clientId, subscriptionId}) => {
        if (!conversationStore) {
            send({username, clientId, subscriptionId, data: {type: 'conversations', conversations: []}})
            return
        }
        try {
            const conversations = await conversationStore.listConversations({username})
            send({username, clientId, subscriptionId, data: {type: 'conversations', conversations}})
        } catch (error) {
            log.error('Failed to list conversations:', error)
            send({username, clientId, subscriptionId, data: {type: 'conversations', conversations: []}})
        }
    }

    const createConversation = ({username, clientId, subscriptionId}) => {
        const id = uuid()
        const now = new Date().toISOString()
        const session = sessions.get({clientId, subscriptionId})
        if (session) {
            // Discard previous ephemeral conversation if any
            if (session.conversationId && ephemeralConversations.has(session.conversationId)) {
                ephemeralConversations.delete(session.conversationId)
            }
            session.conversationId = id
            session.messages = []
            session.workflow = null
        }
        ephemeralConversations.add(id)
        send({username, clientId, subscriptionId, data: {type: 'conversation-created', conversationId: id, title: '', createdAt: now, updatedAt: now}})
        broadcast({username, excludeClientId: clientId, data: {type: 'conversation-claimed', conversationId: id}})
    }

    const selectConversation = async ({username, clientId, subscriptionId, conversationId}) => {
        if (!conversationStore) {
            return
        }
        try {
            await conversationStore.touchConversation({username, conversationId})
            const result = await conversationStore.loadConversation({username, conversationId})
            if (!result) {
                log.warn(`Conversation not found: ${conversationId}`)
                const conversations = await conversationStore.listConversations({username})
                send({username, clientId, subscriptionId, data: {type: 'conversations', conversations}})
                return
            }
            const session = sessions.get({clientId, subscriptionId})
            if (session) {
                // Discard ephemeral conversation if switching away from it
                if (session.conversationId && ephemeralConversations.has(session.conversationId)) {
                    ephemeralConversations.delete(session.conversationId)
                }
                session.conversationId = conversationId
                session.messages = result.messages
                session.workflow = null
            }
            send({username, clientId, subscriptionId, data: {type: 'conversation-loaded', conversationId, messages: result.messages}})
            broadcast({username, excludeClientId: clientId, data: {type: 'conversation-claimed', conversationId}})
        } catch (error) {
            log.error('Failed to select conversation:', error)
            send({username, clientId, subscriptionId, data: {type: 'chat-response', text: 'Failed to load conversation. Please try again.', complete: true}})
        }
    }

    const deleteConversation = async ({username, clientId, subscriptionId, conversationId}) => {
        if (!conversationStore) {
            return
        }
        const session = sessions.get({clientId, subscriptionId})
        if (ephemeralConversations.has(conversationId)) {
            // Not persisted — just discard from memory
            ephemeralConversations.delete(conversationId)
            if (session && session.conversationId === conversationId) {
                session.conversationId = null
                session.messages = []
                session.workflow = null
            }
            return
        }
        try {
            await conversationStore.deleteConversation({username, conversationId})
            if (session && session.conversationId === conversationId) {
                session.conversationId = null
                session.messages = []
                session.workflow = null
            }
            const conversations = await conversationStore.listConversations({username})
            send({username, clientId, subscriptionId, data: {type: 'conversations', conversations}})
        } catch (error) {
            log.error('Failed to delete conversation:', error)
            await listConversations({username, clientId, subscriptionId})
        }
    }

    const deleteAllConversations = async ({username, clientId, subscriptionId}) => {
        if (!conversationStore) {
            return
        }
        const session = sessions.get({clientId, subscriptionId})
        try {
            // Clear all ephemeral conversations for this user
            for (const [convId] of ephemeralConversations) {
                ephemeralConversations.delete(convId)
            }
            await conversationStore.deleteAllConversations({username})
            if (session) {
                session.conversationId = null
                session.messages = []
                session.workflow = null
            }
            send({username, clientId, subscriptionId, data: {type: 'conversations', conversations: []}})
        } catch (error) {
            log.error('Failed to delete all conversations:', error)
            await listConversations({username, clientId, subscriptionId})
        }
    }

    const createSession = async ({username, clientId, subscriptionId}) => {
        sessions.create({username, clientId, subscriptionId})
        if (conversationStore) {
            const conversations = await conversationStore.listConversations({username})
            if (conversations.length === 0) {
                createConversation({username, clientId, subscriptionId})
            } else {
                send({username, clientId, subscriptionId, data: {type: 'conversations', conversations}})
            }
        }
    }

    const removeSession = ({clientId, subscriptionId}) => {
        sessions.remove({clientId, subscriptionId})
    }

    const removeClientSessions = ({clientId}) => {
        sessions.removeByClient({clientId})
    }

    const shutdown = () => {
        sessions.clear()
    }

    return {createSession, removeSession, removeClientSessions, listConversations, createConversation, selectConversation, deleteConversation, deleteAllConversations, handleMessage, shutdown}
}

module.exports = {createOrchestrator}
