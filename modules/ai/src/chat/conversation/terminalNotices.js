// Translatable user-facing notices that end a turn when something
// forced it (tool round cap, guard bail), plus the bail-display
// factories the toolCallGuard calls.

const {concat, ignoreElements, of} = require('rxjs')

const TOOL_ROUND_CAP_MESSAGE = 'This is taking more steps than expected, so I\'ve stopped here. Please try rephrasing your request.'
const TOOL_CONSECUTIVE_FAILURES_MESSAGE = 'Having repeated trouble with that tool. Please try a different approach.'
const TOOL_INVALID_ARGS_MESSAGE = 'Could not work out the right inputs for that tool. Please try a different approach.'

// args.tool is available to translators and to history/debug inspection;
// the current English copy interpolates only {max}.
function consecutiveFailureBail(tool, max) {
    return {
        key: 'home.chat.notices.toolConsecutiveFailures',
        args: {tool, max},
        fallback: TOOL_CONSECUTIVE_FAILURES_MESSAGE
    }
}

function invalidArgsBail(tool, max) {
    return {
        key: 'home.chat.notices.toolInvalidArgs',
        args: {tool, max},
        fallback: TOOL_INVALID_ARGS_MESSAGE
    }
}

function toolRoundCapDisplay(max) {
    return {
        key: 'home.chat.notices.toolRoundCap',
        args: {max},
        fallback: TOOL_ROUND_CAP_MESSAGE
    }
}

function createTerminalNotices({bus, conversationId, append$}) {
    return {toolRoundCapReached$, guardBail$}

    function toolRoundCapReached$(maxRounds) {
        const display = toolRoundCapDisplay(maxRounds)
        return emit$('conversation.toolRoundCapReached', display, {conversationId, maxRounds})
    }

    function guardBail$(display) {
        return emit$('conversation.toolBail', display, {conversationId, displayKey: display.key})
    }

    function emit$(spanName, display, spanAttrs) {
        const message = {role: 'assistant', content: display.fallback, display}
        return bus.track$(spanName, spanAttrs,
            concat(
                of({notice: {content: display.fallback, display}}),
                append$(message).pipe(ignoreElements())
            )
        )
    }
}

module.exports = {createTerminalNotices, consecutiveFailureBail, invalidArgsBail}
