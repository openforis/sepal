const log = require('#sepal/log').getLogger('failureTracker')

const MAX_CONSECUTIVE_FAILED_ROUNDS = 4
const MAX_FAILED_TOOL_ROUNDS = 6
const MAX_DISTINCT_ERRORS_IN_BAIL = 2

const summarizeFailureMessages = toolResults => {
    const messages = toolResults
        .map(({result}) => result?.error?.message)
        .filter(Boolean)
    return [...new Set(messages)].slice(0, MAX_DISTINCT_ERRORS_IN_BAIL).join(' ')
}

const isFailure = ({result}) => result && result.success === false

const buildBailMessage = lastFailureSummary => lastFailureSummary
    ? `I'm hitting persistent errors and could not complete the request. Last error: ${lastFailureSummary}`
    : "I'm hitting persistent errors and could not complete the request."

const createFailureTracker = ({conversationId}) => {
    let consecutiveAllFailed = 0
    let totalRoundsWithFailures = 0
    let lastFailureSummary = null

    const recordRound = toolResults => {
        const failed = toolResults.filter(isFailure)
        const allFailed = toolResults.length > 0 && failed.length === toolResults.length

        if (failed.length) {
            totalRoundsWithFailures++
            lastFailureSummary = summarizeFailureMessages(toolResults) || lastFailureSummary
        }

        if (allFailed) {
            consecutiveAllFailed++
        } else {
            consecutiveAllFailed = 0
        }
    }

    const bailReason = round => {
        if (consecutiveAllFailed >= MAX_CONSECUTIVE_FAILED_ROUNDS) {
            log.warn(`[conv ${conversationId}] Bailing after ${consecutiveAllFailed} consecutive all-failed rounds (round ${round}). Last failure: ${lastFailureSummary || 'unknown'}`)
            return buildBailMessage(lastFailureSummary)
        } else if (totalRoundsWithFailures >= MAX_FAILED_TOOL_ROUNDS) {
            log.warn(`[conv ${conversationId}] Bailing after ${totalRoundsWithFailures} rounds with at least one failed tool (round ${round}). Last failure: ${lastFailureSummary || 'unknown'}`)
            return buildBailMessage(lastFailureSummary)
        } else {
            return null
        }
    }

    return {recordRound, bailReason}
}

module.exports = {createFailureTracker}
