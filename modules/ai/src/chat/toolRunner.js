const Ajv = require('ajv')

const log = require('#sepal/log').getLogger('toolRunner')
const ajv = new Ajv({allErrors: true, strict: false})

const MAX_VALUE_STRING = 80
const MAX_DATA_STRING = 200
const MAX_ERROR_STRING = 200

const summarizeValue = (value, maxStringLen = MAX_VALUE_STRING) => {
    if (value === null || value === undefined) {
        return String(value)
    } else if (typeof value === 'string') {
        return value.length > maxStringLen ? `"${value.slice(0, maxStringLen)}…"` : `"${value}"`
    } else if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    } else if (Array.isArray(value)) {
        return `[${value.length}]`
    } else if (typeof value === 'object') {
        return `{${Object.keys(value).join(',')}}`
    } else {
        return typeof value
    }
}

const summarizeInput = input => {
    if (!input || typeof input !== 'object') {
        return ''
    } else if (Object.keys(input).length === 0) {
        return '{}'
    } else {
        return Object.keys(input).map(k => `${k}=${summarizeValue(input[k])}`).join(', ')
    }
}

const summarizeResult = result => {
    if (!result) {
        return 'no-result'
    } else if (result.success === false) {
        const code = result.error?.code || 'ERROR'
        const msg = result.error?.message || ''
        const truncated = msg.length > MAX_ERROR_STRING ? msg.slice(0, MAX_ERROR_STRING) + '…' : msg
        return `FAIL(${code}): ${truncated}`
    } else if (result.data === undefined) {
        return 'OK'
    } else {
        return `OK ${summarizeValue(result.data, MAX_DATA_STRING)}`
    }
}

const validateParams = (toolName, params, schema) => {
    if (!schema || !schema.properties) return null
    const validate = ajv.compile(schema)
    if (validate(params || {})) return null
    const errors = validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; ')
    log.warn(`Tool ${toolName} parameter validation failed: ${errors}`)
    return errors
}

const invokeTool = async ({tool, toolCall, ctx}) => {
    const inputSummary = summarizeInput(toolCall.input)

    const validationError = validateParams(toolCall.name, toolCall.input, tool.parameters)
    if (validationError) {
        const result = {success: false, error: {code: 'VALIDATION_ERROR', message: `Invalid parameters: ${validationError}`}}
        log.debug(`Tool ${toolCall.name}(${inputSummary}) → ${summarizeResult(result)}`)
        return result
    }

    log.debug(`Tool ${toolCall.name}(${inputSummary}) — executing`)
    log.trace(() => [`Tool input: ${toolCall.name}`, toolCall.input])
    const t = Date.now()
    try {
        const result = await tool.handler({
            username: ctx.username,
            params: toolCall.input || {},
            send: ctx.send,
            request: ctx.request,
            session: ctx.session
        })
        log.debug(`Tool ${toolCall.name} → ${summarizeResult(result)} (${Date.now() - t}ms)`)
        log.trace(() => [`Tool result: ${toolCall.name}`, result])
        return result
    } catch (error) {
        log.error(`Tool ${toolCall.name} threw after ${Date.now() - t}ms:`, error)
        return {success: false, error: {code: 'TOOL_ERROR', message: error.message}}
    }
}

const runOne = async ({toolCall, registry, ctx}) => {
    const tool = registry ? registry.getTool(toolCall.name) : null
    if (!tool) {
        log.warn(`Unknown tool: ${toolCall.name}(${summarizeInput(toolCall.input)})`)
        return {success: false, error: {code: 'UNKNOWN_TOOL', message: `Unknown tool: ${toolCall.name}`}}
    } else {
        return invokeTool({tool, toolCall, ctx})
    }
}

const emitToolStart = (ctx, toolCall) => ctx.send({
    type: 'tool-start',
    conversationId: ctx.conversationId,
    toolCallId: toolCall.id,
    name: toolCall.name,
    input: toolCall.input || {}
})

const emitToolEnd = (ctx, toolCall, result) => {
    const success = result.success !== false
    ctx.send({
        type: 'tool-end',
        conversationId: ctx.conversationId,
        toolCallId: toolCall.id,
        success,
        data: success ? result.data : undefined,
        error: success ? undefined : result.error
    })
}

const createToolRunner = ({registry}) => ({
    runAll: async ({toolCalls, ctx}) => {
        const results = []
        for (const toolCall of toolCalls) {
            emitToolStart(ctx, toolCall)
            const result = await runOne({toolCall, registry, ctx})
            emitToolEnd(ctx, toolCall, result)
            results.push({toolCallId: toolCall.id, result})
        }
        return results
    }
})

module.exports = {createToolRunner}
