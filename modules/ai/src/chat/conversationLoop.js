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

// OpenAI-compatible: prompt_tokens / completion_tokens / total_tokens.
// Anthropic: input_tokens / output_tokens (+ cache_*_input_tokens).
const usageSummary = usage => {
    if (!usage) return null
    const prompt = usage.prompt_tokens ?? usage.input_tokens
    const completion = usage.completion_tokens ?? usage.output_tokens
    const total = usage.total_tokens
        ?? (prompt !== undefined && completion !== undefined ? prompt + completion : null)
    return {prompt, completion, total}
}

// Per-round prompt composition (in characters) so we can see where context
// goes. Useful when total tokens grow faster than expected.
const composePromptBreakdown = ({messages, systemPrompt, formattedTools}) => {
    const toolsBytes = JSON.stringify(formattedTools || []).length
    const systemBytes = (systemPrompt || '').length
    const counts = {user: 0, assistant: 0, toolResult: 0, toolCall: 0, history: 0}
    let largestToolResult = {name: null, bytes: 0}
    for (const msg of messages) {
        if (msg.role === 'user') {
            counts.user += (msg.content || '').length
        } else if (msg.role === 'assistant') {
            counts.assistant += (msg.content || '').length
            if (msg.toolCalls?.length) {
                counts.toolCall += JSON.stringify(msg.toolCalls).length
            }
        } else if (msg.role === 'tool') {
            for (const tr of (msg.toolResults || [])) {
                const bytes = JSON.stringify(tr.result || {}).length
                counts.toolResult += bytes
                const name = tr.toolName || tr.toolCallId
                if (bytes > largestToolResult.bytes) {
                    largestToolResult = {name, bytes}
                }
            }
        }
    }
    counts.history = counts.user + counts.assistant + counts.toolResult + counts.toolCall
    const total = systemBytes + toolsBytes + counts.history
    return {systemBytes, toolsBytes, ...counts, total, largestToolResult}
}

const runRound = async ({round, ctx, provider, formattedTools, promptBuilder, toolRunner, failureTracker, stallCount, stallNudge, totals}) => {
    if (round === WARN_ROUND_THRESHOLD) {
        log.warn(`Tool-call loop exceeded ${WARN_ROUND_THRESHOLD} rounds (cap ${MAX_TOOL_CALL_ROUNDS})`)
    }
    ctx.send({type: 'status', conversationId: ctx.conversationId, status: 'thinking'})

    const promptMessages = stallNudge ? [...ctx.messages, stallNudge] : ctx.messages
    const systemPrompt = promptBuilder(ctx)
    const breakdown = composePromptBreakdown({messages: promptMessages, systemPrompt, formattedTools})
    const largest = breakdown.largestToolResult
    log.info(`[conv ${ctx.conversationId}] round ${round}: prompt composition: system=${breakdown.systemBytes} + tools=${breakdown.toolsBytes} + history=${breakdown.history} (user=${breakdown.user}, assistant=${breakdown.assistant}, toolCalls=${breakdown.toolCall}, toolResults=${breakdown.toolResult}${largest.bytes ? `, largest result=${largest.name}:${largest.bytes}b` : ''}) = ${breakdown.total} bytes (~${Math.round(breakdown.total / 4)} tokens approx)`)
    log.debug(`[conv ${ctx.conversationId}] round ${round}: requesting (${promptMessages.length} msgs${stallNudge ? ', after nudge' : ''})`)

    const result = await streamWithChunkBuffer({
        provider, ctx,
        messages: promptMessages,
        formattedTools,
        systemPrompt
    })
    const usage = usageSummary(result.usage)
    if (usage) {
        if (usage.prompt) totals.prompt += usage.prompt
        if (usage.completion) totals.completion += usage.completion
        log.info(`[conv ${ctx.conversationId}] round ${round}: ${usage.prompt ?? '?'} prompt + ${usage.completion ?? '?'} completion tokens (cumulative: ${totals.prompt} prompt, ${totals.completion} completion)`)
    }
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
    const totals = {prompt: 0, completion: 0}
    const t = Date.now()
    let round = 0
    let stallCount = 0
    let stallNudge = null

    log.info(`[conv ${ctx.conversationId}] starting loop, ${ctx.messages.length} prior messages`)

    const formatTotals = () => `${totals.prompt} prompt + ${totals.completion} completion = ${totals.prompt + totals.completion} tokens`

    while (round < MAX_TOOL_CALL_ROUNDS) {
        round++
        const outcome = await runRound({
            round, ctx, provider, formattedTools, promptBuilder, toolRunner, failureTracker,
            stallCount, stallNudge, totals
        })
        stallNudge = null

        if (outcome.action === 'done') {
            log.info(`[conv ${ctx.conversationId}] turn complete after ${round} round(s) (${Date.now() - t}ms, ${formatTotals()})`)
            return {kind: 'done', assistantText: outcome.assistantText, rounds: round}
        } else if (outcome.action === 'bail') {
            log.info(`[conv ${ctx.conversationId}] bailed after ${round} round(s) (${formatTotals()})`)
            return {kind: 'bailed', message: outcome.message, rounds: round}
        } else if (outcome.action === 'nudge') {
            stallCount++
            stallNudge = outcome.nudge
        } else {
            stallCount = 0
        }
    }

    log.info(`[conv ${ctx.conversationId}] cap-reached after ${round} round(s) (${formatTotals()})`)
    return {kind: 'cap-reached', rounds: round}
}

module.exports = {runConversation, streamWithChunkBuffer, MAX_TOOL_CALL_ROUNDS}
