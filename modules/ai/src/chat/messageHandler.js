const {Subject, bufferTime, filter} = require('rxjs')
const Ajv = require('ajv')
const {getLLM, buildSystemPrompt} = require('./provider')

const log = require('#sepal/log').getLogger('messageHandler')

const MAX_TOOL_CALL_ROUNDS = 10
const CHUNK_BUFFER_MS = 100
const RETRY_DELAY_MS = 2000

const ajv = new Ajv({allErrors: true, strict: false})

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

const createMessageHandler = ({response, config, registry, conversationStore, sessionStore, ephemeralConversations}) => {
    const userRateLimits = {} // username -> {timestamps: []}

    const {provider, formattedTools} = getLLM({config, registry})

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
                        toolCallId: tc.id,
                        result: {success: false, error: {code: 'VALIDATION_ERROR', message: `Invalid parameters: ${validationError}`}}
                    })
                } else {
                    try {
                        log.debug(`Executing tool: ${tc.name}`, tc.input)
                        const result = await tool.handler({username, params: tc.input || {}, send: sendFn, session})
                        log.debug(`Tool result:`, {toolCallId: tc.id, result})
                        results.push({toolCallId: tc.id, result})
                    } catch (error) {
                        log.error(`Tool ${tc.name} error:`, error)
                        results.push({
                            toolCallId: tc.id,
                            result: {success: false, error: {code: 'TOOL_ERROR', message: error.message}}
                        })
                    }
                }
            } else {
                log.warn(`Unknown tool: ${tc.name}`)
                results.push({
                    toolCallId: tc.id,
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
        const session = sessionStore.get({clientId, subscriptionId})
        if (!session) {
            log.warn(`No session for ${clientId}:${subscriptionId}`)
            response.send({
                username, clientId, subscriptionId,
                data: {type: 'chat-response', text: 'Session not found. Please close and reopen the chat.', complete: true}
            })
            return
        }

        if (!session.conversationId) {
            response.send({
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
            response.send({
                username, clientId, subscriptionId,
                data: {type: 'chat-response', conversationId, text: 'You are sending messages too quickly. Please wait a moment.', complete: true}
            })
            return
        }

        // Echo mode if no provider configured
        if (!provider) {
            response.send({
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
                response.send({username, clientId, subscriptionId, data: {type: 'conversations', conversations}})
            } catch (error) {
                log.error('Failed to update conversation title:', error)
            }
        }

        response.send({username, clientId, subscriptionId, data: {type: 'status', conversationId, status: 'thinking'}})

        const systemPrompt = buildSystemPrompt({username, registry})
        const sendFn = data => response.send({username, clientId, subscriptionId, data})

        try {
            let rounds = 0
            let done = false

            while (!done && rounds < MAX_TOOL_CALL_ROUNDS) {
                rounds++

                const chunkBuffer = createChunkBuffer(text => response.send({
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
                    response.send({
                        username, clientId, subscriptionId,
                        data: {type: 'chat-response', conversationId, complete: true}
                    })
                    done = true
                }
            }

            if (!done) {
                const msg = 'I reached the maximum number of tool call rounds. Here is what I have so far.'
                response.send({
                    username, clientId, subscriptionId,
                    data: {type: 'chat-response', conversationId, text: msg, complete: true}
                })
            }
        } catch (error) {
            if (error.status === 429) {
                log.warn('LLM rate limited, retrying once after delay')
                try {
                    await delay(RETRY_DELAY_MS)
                    const retryChunkBuffer = createChunkBuffer(text => response.send({
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
                    response.send({
                        username, clientId, subscriptionId,
                        data: {type: 'chat-response', conversationId, complete: true}
                    })
                } catch (retryError) {
                    log.error('LLM retry also failed:', retryError)
                    response.send({
                        username, clientId, subscriptionId,
                        data: {type: 'chat-response', conversationId, text: 'The AI service is rate-limited. Please try again in a moment.', complete: true}
                    })
                }
            } else {
                log.error('Orchestrator error:', error)
                response.send({
                    username, clientId, subscriptionId,
                    data: {type: 'chat-response', conversationId, text: 'An error occurred while processing your message. Please try again.', complete: true}
                })
            }
        }
    }

    return {handleMessage}
}

module.exports = {createMessageHandler}
