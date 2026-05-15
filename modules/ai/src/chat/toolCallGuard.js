const CONSECUTIVE_FAILURE_LIMIT = 3
const INVALID_ARGS_LIMIT = 3

function createToolCallGuard({consecutiveFailureBail, invalidArgsBail}) {
    const failedCalls = new Map()
    const consecutiveFailures = new Map()
    const invalidArgs = new Map()
    // Whatever the matching bail factory produced; the guard treats the value as opaque.
    let bailValue = null

    return {blockedRepeat, record, bail}

    function blockedRepeat(toolCall) {
        if (!failedCalls.has(callKey(toolCall))) return null
        return {
            ok: false,
            error: {code: 'TOOL_REPEAT_BLOCKED', message: `tool ${toolCall.name}: identical failing call repeated; try different args or another tool`}
        }
    }

    // Blocked-repeat short-circuits don't pass through record(), so they don't tick either
    // counter — the original failure already counted, and the round cap is the backstop
    // for a loop that keeps emitting the same blocked call.
    function record(toolCall, result) {
        if (result.ok) {
            consecutiveFailures.set(toolCall.name, 0)
            invalidArgs.set(toolCall.name, 0)
            return
        }
        failedCalls.set(callKey(toolCall), true)
        if (result.error?.code === 'INVALID_TOOL_ARGS') {
            tick(invalidArgs, toolCall.name, INVALID_ARGS_LIMIT, invalidArgsBail)
        } else {
            tick(consecutiveFailures, toolCall.name, CONSECUTIVE_FAILURE_LIMIT, consecutiveFailureBail)
        }
    }

    function bail() {
        return bailValue
    }

    function tick(map, toolName, limit, bailFactory) {
        const next = (map.get(toolName) || 0) + 1
        map.set(toolName, next)
        if (!bailValue && next >= limit) bailValue = bailFactory(toolName, limit)
    }
}

function callKey({name, input}) {
    return `${name}:${canonicalJson(input)}`
}

function canonicalJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    const keys = Object.keys(value).sort()
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
}

module.exports = {createToolCallGuard}
