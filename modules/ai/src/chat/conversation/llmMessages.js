const {turnContextMessage} = require('../turnContext')

function messagesForLlm({messages, selection, includeTurnContext, isolateHistory}) {
    const latestUserIndex = Math.max(messages.findLastIndex(message => message.role === 'user'), 0)
    const completed = messages.slice(0, latestUserIndex)
    const {history, projection} = historyForLlm({completed, isolateHistory})
    const activeTurn = messages.slice(latestUserIndex)
    const contextMessage = includeTurnContext ? turnContextMessage(selection) : null
    return {
        llmMessages: contextMessage
            ? [...history, contextMessage, ...activeTurn]
            : [...history, ...activeTurn],
        projection
    }
}

function historyForLlm({completed, isolateHistory}) {
    if (isolateHistory) {
        return {history: completed.filter(message => message.role === 'system'), projection: null}
    }
    const projected = projectCompletedTurns(completed)
    return {
        history: projected,
        projection: completed.length ? {before: completed, after: projected} : null
    }
}

// Completed turns are replayed to the LLM as plain user/assistant dialogue:
// their tool-call and tool-result messages are executable plumbing a local
// model can mistake for still-active work. Persisted history keeps them.
function projectCompletedTurns(completed) {
    return completed.flatMap(message => {
        if (message.role === 'tool') return []
        if (message.role === 'assistant' && message.toolCalls) {
            return message.content?.trim() ? [{role: 'assistant', content: message.content}] : []
        }
        return [message]
    })
}

module.exports = {messagesForLlm}
