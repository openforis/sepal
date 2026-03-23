const {readFileSync} = require('fs')
const {join} = require('path')
const {Subject, bufferTime, filter} = require('rxjs')
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

const createOrchestrator = ({out$, config, registry}) => {
    const sessions = new SessionStore({ttlMs: config.sessionTtlMs})
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
                        log.debug(`Executing tool: ${tc.name}`)
                        const result = await tool.handler({username, params: tc.input || {}, send: sendFn, session})
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

    const handleMessage = async ({username, clientId, subscriptionId, text}) => {
        const session = sessions.get({clientId, subscriptionId})
        if (!session) {
            log.warn(`No session for ${clientId}:${subscriptionId}`)
            send({
                username, clientId, subscriptionId,
                data: {type: 'response', text: 'Session not found. Please close and reopen the chat.', status: 'complete'}
            })
            return
        }

        if (isRateLimited(username, config.rateLimit)) {
            send({
                username, clientId, subscriptionId,
                data: {type: 'response', text: 'You are sending messages too quickly. Please wait a moment.', status: 'complete'}
            })
            return
        }

        // Echo mode if no provider configured
        if (!provider) {
            send({
                username, clientId, subscriptionId,
                data: {type: 'response', text: `Echo: ${text}`, status: 'complete'}
            })
            return
        }

        session.messages.push({role: 'user', content: text})

        send({username, clientId, subscriptionId, data: {type: 'status', status: 'thinking'}})

        const systemPrompt = buildSystemPrompt({username, registry})
        const sendFn = data => send({username, clientId, subscriptionId, data})

        try {
            let rounds = 0
            let done = false

            while (!done && rounds < MAX_TOOL_CALL_ROUNDS) {
                rounds++

                const chunkBuffer = createChunkBuffer(text => send({
                    username, clientId, subscriptionId,
                    data: {type: 'chunk', text}
                }))

                const result = await provider.stream({
                    messages: session.messages,
                    tools: formattedTools,
                    systemPrompt,
                    onChunk: chunk => chunkBuffer.append(chunk)
                })

                chunkBuffer.end()

                if (result.toolCalls && result.toolCalls.length > 0) {
                    send({
                        username, clientId, subscriptionId,
                        data: {type: 'chunk_end'}
                    })
                    session.messages.push({
                        role: 'assistant',
                        content: result.text,
                        toolCalls: result.toolCalls
                    })

                    const toolResults = await executeToolCalls({
                        toolCalls: result.toolCalls,
                        username,
                        session,
                        sendFn
                    })

                    session.messages.push({role: 'tool', toolResults})
                } else {
                    session.messages.push({role: 'assistant', content: result.text})
                    send({
                        username, clientId, subscriptionId,
                        data: {type: 'response', status: 'complete'}
                    })
                    done = true
                }
            }

            if (!done) {
                const msg = 'I reached the maximum number of tool call rounds. Here is what I have so far.'
                send({
                    username, clientId, subscriptionId,
                    data: {type: 'response', text: msg, status: 'complete'}
                })
            }
        } catch (error) {
            if (error.status === 429) {
                log.warn('LLM rate limited, retrying once after delay')
                try {
                    await delay(RETRY_DELAY_MS)
                    const retryChunkBuffer = createChunkBuffer(text => send({
                        username, clientId, subscriptionId,
                        data: {type: 'chunk', text}
                    }))
                    const retryResult = await provider.stream({
                        messages: session.messages,
                        tools: formattedTools,
                        systemPrompt,
                        onChunk: chunk => retryChunkBuffer.append(chunk)
                    })
                    retryChunkBuffer.end()
                    session.messages.push({role: 'assistant', content: retryResult.text})
                    send({
                        username, clientId, subscriptionId,
                        data: {type: 'response', status: 'complete'}
                    })
                } catch (retryError) {
                    log.error('LLM retry also failed:', retryError)
                    send({
                        username, clientId, subscriptionId,
                        data: {type: 'response', text: 'The AI service is rate-limited. Please try again in a moment.', status: 'complete'}
                    })
                }
            } else {
                log.error('Orchestrator error:', error)
                send({
                    username, clientId, subscriptionId,
                    data: {type: 'response', text: 'An error occurred while processing your message. Please try again.', status: 'complete'}
                })
            }
        }
    }

    const createSession = ({username, clientId, subscriptionId}) => {
        sessions.create({username, clientId, subscriptionId})
    }

    const removeSession = ({clientId, subscriptionId}) => {
        sessions.remove({clientId, subscriptionId})
    }

    const clearSession = ({clientId, subscriptionId}) => {
        const session = sessions.get({clientId, subscriptionId})
        if (session) {
            session.messages = []
            session.workflow = null
            log.info(`Session cleared: ${clientId}:${subscriptionId}`)
        }
    }

    const removeClientSessions = ({clientId}) => {
        sessions.removeByClient({clientId})
    }

    const shutdown = () => {
        sessions.clear()
    }

    return {createSession, removeSession, removeClientSessions, clearSession, handleMessage, shutdown}
}

module.exports = {createOrchestrator}
