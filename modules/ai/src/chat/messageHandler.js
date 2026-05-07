const {Subject, bufferTime, filter} = require('rxjs')
const Ajv = require('ajv')
const {getLLM, buildSystemPrompt} = require('./provider')

const log = require('#sepal/log').getLogger('messageHandler')

const MAX_TOOL_CALL_ROUNDS = 50
const WARN_ROUND_THRESHOLD = 30
const MAX_CONSECUTIVE_FAILED_ROUNDS = 4
const MAX_FAILED_TOOL_ROUNDS = 6
const CHUNK_BUFFER_MS = 100
const RETRY_DELAY_MS = 2000

const summarizeToolFailures = toolResults => {
    const messages = toolResults
        .map(({result}) => result?.error?.message)
        .filter(Boolean)
    return [...new Set(messages)].slice(0, 2).join(' ')
}

const summarizeValue = (value, maxStringLen = 80) => {
    if (value === null || value === undefined) return String(value)
    if (typeof value === 'string') return value.length > maxStringLen ? `"${value.slice(0, maxStringLen)}…"` : `"${value}"`
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) return `[${value.length}]`
    if (typeof value === 'object') return `{${Object.keys(value).join(',')}}`
    return typeof value
}

const summarizeInput = input => {
    if (!input || typeof input !== 'object') return ''
    const keys = Object.keys(input)
    if (keys.length === 0) return '{}'
    return keys.map(k => `${k}=${summarizeValue(input[k])}`).join(', ')
}

const summarizeResult = result => {
    if (!result) return 'no-result'
    if (result.success === false) {
        const code = result.error?.code || 'ERROR'
        const msg = result.error?.message || ''
        return `FAIL(${code}): ${msg.length > 200 ? msg.slice(0, 200) + '…' : msg}`
    }
    if (result.data === undefined) return 'OK'
    return `OK ${summarizeValue(result.data, 200)}`
}

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

    const executeToolCalls = async ({toolCalls, conversationId, username, session, sendFn, requestFn}) => {
        const results = []
        for (const tc of toolCalls) {
            sendFn({type: 'tool-start', conversationId, toolCallId: tc.id, name: tc.name, input: tc.input || {}})
            const tool = registry ? registry.getTool(tc.name) : null
            const inputSummary = summarizeInput(tc.input)
            let toolResult
            if (tool) {
                const validationError = validateParams(tc.name, tc.input, tool.parameters)
                if (validationError) {
                    toolResult = {success: false, error: {code: 'VALIDATION_ERROR', message: `Invalid parameters: ${validationError}`}}
                    log.info(`Tool ${tc.name}(${inputSummary}) → ${summarizeResult(toolResult)}`)
                } else {
                    log.info(`Tool ${tc.name}(${inputSummary}) — executing`)
                    log.trace(() => [`Tool input: ${tc.name}`, tc.input])
                    try {
                        toolResult = await tool.handler({username, params: tc.input || {}, send: sendFn, request: requestFn, session})
                        log.info(`Tool ${tc.name} → ${summarizeResult(toolResult)}`)
                        log.trace(() => [`Tool result: ${tc.name}`, toolResult])
                    } catch (error) {
                        log.error(`Tool ${tc.name} threw:`, error)
                        toolResult = {success: false, error: {code: 'TOOL_ERROR', message: error.message}}
                    }
                }
            } else {
                log.warn(`Unknown tool: ${tc.name}(${inputSummary})`)
                toolResult = {success: false, error: {code: 'UNKNOWN_TOOL', message: `Unknown tool: ${tc.name}`}}
            }
            const success = toolResult.success !== false
            sendFn({
                type: 'tool-end',
                conversationId,
                toolCallId: tc.id,
                success,
                data: success ? toolResult.data : undefined,
                error: success ? undefined : toolResult.error
            })
            results.push({toolCallId: tc.id, result: toolResult})
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

    // Update the session's selection (open recipes, selected recipe, current
    // section, etc.) without sending a chat message. Called on every 'context'
    // event from the browser so the system prompt at the next round reflects
    // the user's current GUI state.
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
            response.send({
                username, clientId, subscriptionId,
                data: {type: 'chat-response', text: 'Session not found. Please close and reopen the chat.', complete: true}
            })
            return
        }
        // The 'message' event still carries selection for backwards-compat;
        // store it as the latest known context. Subsequent 'context' events
        // overwrite it. Per-round prompts read from session.selection below.
        if (selection !== undefined) {
            session.selection = selection
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

        const sendFn = data => response.send({username, clientId, subscriptionId, data})
        const requestFn = (data, options = {}) =>
            response.request({username, clientId, subscriptionId, data, ...options})

        try {
            let rounds = 0
            let done = false
            let stallNudge = null
            let stallCount = 0
            let consecutiveFailedRounds = 0
            let failedToolRounds = 0
            let bailMessage = null
            let lastFailureSummary = null

            log.info(`[conv ${conversationId}] user message (${text.length} chars), ${messages.length} prior messages`)

            while (!done && rounds < MAX_TOOL_CALL_ROUNDS) {
                rounds++
                if (rounds === WARN_ROUND_THRESHOLD) {
                    log.warn(`Tool-call loop exceeded ${WARN_ROUND_THRESHOLD} rounds (cap ${MAX_TOOL_CALL_ROUNDS})`)
                }
                sendFn({type: 'status', conversationId, status: 'thinking'})

                const chunkBuffer = createChunkBuffer(text => response.send({
                    username, clientId, subscriptionId,
                    data: {type: 'chat-response', conversationId, text}
                }))

                const promptMessages = stallNudge ? [...messages, stallNudge] : messages
                const nudgeApplied = !!stallNudge
                stallNudge = null

                // Rebuild the system prompt every round so the LLM sees the
                // latest selection (open recipes, selected recipe, etc.). The
                // browser pushes 'context' events that update session.selection
                // outside this loop; reading it here keeps the model in sync.
                const systemPrompt = buildSystemPrompt({username, registry, selection: session.selection})

                log.info(`[conv ${conversationId}] round ${rounds}: requesting (${promptMessages.length} msgs${nudgeApplied ? ', after nudge' : ''})`)
                const result = await provider.stream({
                    messages: promptMessages,
                    tools: formattedTools,
                    systemPrompt,
                    onChunk: chunk => chunkBuffer.append(chunk)
                })

                chunkBuffer.end()
                log.info(`[conv ${conversationId}] round ${rounds}: response (${(result.text || '').length} chars text, ${(result.toolCalls || []).length} tool calls, stop=${result.stopReason || 'unknown'})`)

                if (result.toolCalls && result.toolCalls.length > 0) {
                    stallCount = 0
                    const assistantMsg = {
                        role: 'assistant',
                        content: result.text,
                        toolCalls: result.toolCalls
                    }
                    messages.push(assistantMsg)
                    await persistMessage({username, conversationId, message: assistantMsg})

                    const toolResults = await executeToolCalls({
                        toolCalls: result.toolCalls,
                        conversationId,
                        username,
                        session,
                        sendFn,
                        requestFn
                    })

                    const toolMsg = {role: 'tool', toolResults}
                    messages.push(toolMsg)
                    await persistMessage({username, conversationId, message: toolMsg})

                    const failed = toolResults.filter(({result: r}) => r && r.success === false)
                    const allFailed = toolResults.length > 0 && failed.length === toolResults.length
                    if (failed.length) {
                        failedToolRounds++
                        lastFailureSummary = summarizeToolFailures(toolResults) || lastFailureSummary
                    }
                    if (allFailed) {
                        consecutiveFailedRounds++
                        if (consecutiveFailedRounds >= MAX_CONSECUTIVE_FAILED_ROUNDS) {
                            log.warn(`[conv ${conversationId}] Bailing after ${consecutiveFailedRounds} consecutive all-failed rounds (round ${rounds}). Last failure: ${lastFailureSummary || 'unknown'}`)
                            bailMessage = lastFailureSummary
                                ? `I'm hitting persistent errors and could not complete the request. Last error: ${lastFailureSummary}`
                                : "I'm hitting persistent errors and could not complete the request."
                            break
                        }
                    } else {
                        consecutiveFailedRounds = 0
                    }
                    if (!bailMessage && failedToolRounds >= MAX_FAILED_TOOL_ROUNDS) {
                        log.warn(`[conv ${conversationId}] Bailing after ${failedToolRounds} rounds with at least one failed tool (round ${rounds}). Last failure: ${lastFailureSummary || 'unknown'}`)
                        bailMessage = lastFailureSummary
                            ? `I'm hitting persistent errors and could not complete the request. Last error: ${lastFailureSummary}`
                            : "I'm hitting persistent errors and could not complete the request."
                        break
                    }
                } else {
                    const text = (result.text || '').trim()
                    if (!text && stallCount === 0) {
                        stallCount++
                        log.warn(`[conv ${conversationId}] Empty assistant turn (round ${rounds}, stop=${result.stopReason || 'unknown'}); nudging to continue`)
                        stallNudge = {role: 'user', content: 'Continue working on the original request. Either make the next tool call needed, or send a final summary if the request is fulfilled.'}
                        continue
                    }
                    stallCount = 0
                    const assistantMsg = {role: 'assistant', content: result.text}
                    messages.push(assistantMsg)
                    await persistMessage({username, conversationId, message: assistantMsg})
                    response.send({
                        username, clientId, subscriptionId,
                        data: {type: 'chat-response', conversationId, complete: true}
                    })
                    log.info(`[conv ${conversationId}] turn complete after ${rounds} round(s)`)
                    done = true
                }
            }

            if (!done) {
                const msg = bailMessage
                    || `I reached the safety cap of ${MAX_TOOL_CALL_ROUNDS} tool-call rounds. Stopping with what I have so far.`
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
                        systemPrompt: buildSystemPrompt({username, registry, selection: session.selection}),
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

    return {handleMessage, updateContext}
}

module.exports = {createMessageHandler}
