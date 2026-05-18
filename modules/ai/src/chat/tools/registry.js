// The runtime contract every tool consumer needs: name→tool lookup,
// ajv arg validation, structured {ok, data?, error?} envelopes
// (UNKNOWN_TOOL / INVALID_TOOL_ARGS / TOOL_FAILED), and observability
// publishing. Composers wrap an array of tool definitions; consumers
// (Conversation, specialist scope) invoke through it.

const {catchError, defer, map, of, tap} = require('rxjs')
const Ajv = require('ajv')
const addFormats = require('ajv-formats')
const {truncateTo, MAX_DEBUG_TEXT} = require('../debugText')

const NOOP_BUS = {publish() {}}

function createToolRegistry({tools, bus = NOOP_BUS}) {
    const byName = new Map(tools.map(tool => [tool.name, tool]))
    const validators = compileValidators(tools)

    return {schemas, invoke$}

    function schemas() {
        return tools.map(({name, description, parameters}) => ({name, description, parameters}))
    }

    function invoke$(toolCall, context) {
        return envelope$(toolCall, context).pipe(
            tap(envelope => {
                bus.publish(toolResultEvent(toolCall, context, envelope))
                bus.publish(toolResultPayloadEvent(toolCall, context, envelope))
            })
        )
    }

    function envelope$(toolCall, context) {
        const tool = byName.get(toolCall.name)
        if (!tool) {
            return of(failure('UNKNOWN_TOOL', `Tool not found: ${toolCall.name}`))
        }
        const rejection = argsRejection(toolCall)
        if (rejection) {
            return of(rejection)
        }
        return runTool$(tool, toolCall, context)
    }

    function argsRejection(toolCall) {
        if (toolCall.argsError) {
            return failure('INVALID_TOOL_ARGS', toolCall.argsError)
        }
        const validate = validators.get(toolCall.name)
        if (!validate(toolCall.input)) {
            return failure('INVALID_TOOL_ARGS', `Invalid arguments for ${toolCall.name}`, validate.errors)
        }
        return null
    }

    function runTool$(tool, toolCall, context) {
        return defer(() => tool.invoke$(toolCall.input, context)).pipe(
            map(data => ({ok: true, data})),
            catchError(error => of(failure('TOOL_FAILED', error.message)))
        )
    }
}

function compileValidators(tools) {
    const ajv = new Ajv({allErrors: true})
    addFormats(ajv)
    return new Map(tools.map(tool => [
        tool.name,
        tool.parameters ? ajv.compile(tool.parameters) : () => true
    ]))
}

function failure(code, message, details) {
    const error = details ? {code, message, details} : {code, message}
    return {ok: false, error}
}

// Metadata only: result shape, counts, and item keys, never the payload itself.
function toolResultEvent(toolCall, context, {ok, data, error}) {
    const base = {type: 'tool.result', level: 'debug', conversationId: context?.conversationId, toolName: toolCall.name}
    if (!ok) {
        return {...base, message: `tool ${toolCall.name} -> failed code=${error.code}`, ok: false, errorCode: error.code}
    }
    return {...base, ok: true, ...resultShape(toolCall.name, data)}
}

function toolResultPayloadEvent(toolCall, context, envelope) {
    return {
        type: 'tool.resultPayload',
        level: 'trace',
        conversationId: context?.conversationId,
        toolName: toolCall.name,
        message: () => `tool ${toolCall.name} result payload: ${truncateTo(JSON.stringify(envelope), MAX_DEBUG_TEXT)}`
    }
}

function resultShape(toolName, data) {
    if (Array.isArray(data)) {
        const count = data.length
        const firstItemKeys = count > 0 && isPlainObject(data[0]) ? Object.keys(data[0]) : undefined
        const namedCount = data.filter(item => isPlainObject(item) && item.name).length
        return {
            message: `tool ${toolName} -> ok kind=array count=${count} named=${namedCount}`,
            kind: 'array', count, firstItemKeys, namedCount
        }
    }
    const kind = resultKind(data)
    return {message: `tool ${toolName} -> ok kind=${kind}`, kind}
}

function resultKind(data) {
    if (data == null) return 'null'
    if (typeof data === 'object') return 'object'
    return 'scalar'
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

module.exports = {createToolRegistry}
