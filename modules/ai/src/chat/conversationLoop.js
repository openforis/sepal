const log = require('#sepal/log').getLogger('conversationLoop')
const {createChunkBuffer} = require('./chunkBuffer')
const {createFailureTracker} = require('./failureTracker')

const MAX_TOOL_CALL_ROUNDS = 50
const WARN_ROUND_THRESHOLD = 30

const STALL_NUDGE = {
    role: 'user',
    content: 'Continue working on the original request. Either make the next tool call needed, or send a final summary if the request is fulfilled.'
}

const trimToContent = text => text.trim() ? text : ''

const streamWithChunkBuffer = async ({provider, ctx, messages, formattedTools, systemPrompt}) => {
    const chunkBuffer = createChunkBuffer(text => ctx.send({
        type: 'chat-response',
        conversationId: ctx.conversationId,
        text
    }))
    try {
        return await provider.stream({
            messages,
            tools: formattedTools,
            systemPrompt,
            onChunk: chunk => chunkBuffer.append(chunk)
        })
    } finally {
        chunkBuffer.end()
    }
}

const classifyRound = (result, stallCount) => {
    const text = (result.text || '').trim()
    if (result.toolCalls && result.toolCalls.length > 0) {
        return {kind: 'tool-calls'}
    } else if (!text && stallCount === 0) {
        return {kind: 'stall'}
    } else {
        return {kind: 'final-text'}
    }
}

const handleToolCallsRound = async ({result, ctx, toolRunner, failureTracker, round}) => {
    const rawText = result.text || ''
    const assistantMsg = {
        role: 'assistant',
        content: trimToContent(rawText),
        toolCalls: result.toolCalls
    }
    ctx.messages.push(assistantMsg)
    await ctx.persistMessage(assistantMsg)

    const toolResults = await toolRunner.runAll({toolCalls: result.toolCalls, ctx})
    const toolMsg = {role: 'tool', toolResults}
    ctx.messages.push(toolMsg)
    await ctx.persistMessage(toolMsg)

    failureTracker.recordRound(toolResults)
    const bail = failureTracker.bailReason(round)
    return bail
        ? {action: 'bail', message: bail}
        : {action: 'continue'}
}

const handleFinalTextRound = async ({result, ctx}) => {
    const rawText = result.text || ''
    const assistantMsg = {role: 'assistant', content: trimToContent(rawText)}
    ctx.messages.push(assistantMsg)
    await ctx.persistMessage(assistantMsg)
    ctx.sendChatResponse({complete: true})
    return {action: 'done', assistantText: rawText.trim()}
}

const runRound = async ({round, ctx, provider, formattedTools, promptBuilder, toolRunner, failureTracker, stallCount, stallNudge}) => {
    if (round === WARN_ROUND_THRESHOLD) {
        log.warn(`Tool-call loop exceeded ${WARN_ROUND_THRESHOLD} rounds (cap ${MAX_TOOL_CALL_ROUNDS})`)
    }
    ctx.send({type: 'status', conversationId: ctx.conversationId, status: 'thinking'})

    const promptMessages = stallNudge ? [...ctx.messages, stallNudge] : ctx.messages
    log.debug(`[conv ${ctx.conversationId}] round ${round}: requesting (${promptMessages.length} msgs${stallNudge ? ', after nudge' : ''})`)

    const result = await streamWithChunkBuffer({
        provider, ctx,
        messages: promptMessages,
        formattedTools,
        systemPrompt: promptBuilder(ctx)
    })
    log.debug(`[conv ${ctx.conversationId}] round ${round}: response (${(result.text || '').length} chars text, ${(result.toolCalls || []).length} tool calls, stop=${result.stopReason || 'unknown'})`)

    const classification = classifyRound(result, stallCount)
    if (classification.kind === 'tool-calls') {
        return handleToolCallsRound({result, ctx, toolRunner, failureTracker, round})
    } else if (classification.kind === 'stall') {
        log.warn(`[conv ${ctx.conversationId}] Empty assistant turn (round ${round}, stop=${result.stopReason || 'unknown'}); nudging to continue`)
        return {action: 'nudge', nudge: STALL_NUDGE}
    } else {
        return handleFinalTextRound({result, ctx})
    }
}

const runConversation = async ({ctx, provider, formattedTools, promptBuilder, toolRunner}) => {
    const failureTracker = createFailureTracker({conversationId: ctx.conversationId})
    const t = Date.now()
    let round = 0
    let stallCount = 0
    let stallNudge = null

    log.info(`[conv ${ctx.conversationId}] starting loop, ${ctx.messages.length} prior messages`)

    while (round < MAX_TOOL_CALL_ROUNDS) {
        round++
        const outcome = await runRound({
            round, ctx, provider, formattedTools, promptBuilder, toolRunner, failureTracker,
            stallCount, stallNudge
        })
        stallNudge = null

        if (outcome.action === 'done') {
            log.info(`[conv ${ctx.conversationId}] turn complete after ${round} round(s) (${Date.now() - t}ms)`)
            return {kind: 'done', assistantText: outcome.assistantText, rounds: round}
        } else if (outcome.action === 'bail') {
            return {kind: 'bailed', message: outcome.message, rounds: round}
        } else if (outcome.action === 'nudge') {
            stallCount++
            stallNudge = outcome.nudge
        } else {
            stallCount = 0
        }
    }

    return {kind: 'cap-reached', rounds: round}
}

module.exports = {runConversation, streamWithChunkBuffer, MAX_TOOL_CALL_ROUNDS}
