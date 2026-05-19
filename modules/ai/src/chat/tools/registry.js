// Tool registry: name→tool lookup, ajv arg validation, structured
// {ok, data?, error?} envelopes (UNKNOWN_TOOL / INVALID_TOOL_ARGS /
// TOOL_FAILED), and observability publishing.

const {catchError, defer, map, of, tap} = require('rxjs')
const Ajv = require('ajv')
const addFormats = require('ajv-formats')
const {createDiagnostics, truncateString} = require('../diagnostics')
const {isChannelEmission} = require('../channelEvents')

const NOOP_BUS = {publish() {}}
const DEFAULT_DIAGNOSTICS = createDiagnostics()
const MAX_ERROR_SUMMARY_CHARS = 1200

function createToolRegistry({tools, bus = NOOP_BUS, diagnostics = DEFAULT_DIAGNOSTICS}) {
    const byName = new Map(tools.map(tool => [tool.name, tool]))
    const validators = compileValidators(tools)

    return {schemas, flag, invoke$}

    function schemas() {
        return tools.map(({name, description, parameters}) => ({name, description, parameters}))
    }

    // Descriptor flag accessor. Keep flags off the wire (schemas() strips them);
    // the loop reads them here to drive behavior without coupling to tool names.
    function flag(name, flagName) {
        return byName.get(name)?.[flagName] === true
    }

    function invoke$(toolCall, context) {
        return envelope$(toolCall, context).pipe(
            tap(value => {
                if (isChannelEmission(value)) return
                bus.publish(toolResultEvent(toolCall, context, value))
                bus.publish(toolResultPayloadEvent(toolCall, context, value, diagnostics))
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
            map(value => {
                if (isChannelEmission(value)) return value
                // A tool may explicitly return an envelope ({ok: boolean, data|error})
                // to carry structured success/failure (e.g. recipe_patch's STALE_WRITE,
                // update_recipe's UPDATE_FAILED). Pass envelopes through so the outer
                // tool-end event and the LLM-facing toolResult reflect the real
                // outcome instead of being wrapped as ok=true with the failure
                // hidden inside data.
                if (value && typeof value === 'object' && typeof value.ok === 'boolean') return value
                return {ok: true, data: value}
            }),
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
        const errorSummary = toolErrorSummary(error)
        return {
            ...base,
            message: `tool ${toolCall.name} -> failed code=${error.code}${errorSummary ? ` details=${errorSummary}` : ''}`,
            ok: false,
            errorCode: error.code,
            errorSummary
        }
    }
    return {...base, ok: true, ...resultShape(toolCall.name, data)}
}

function toolResultPayloadEvent(toolCall, context, envelope, diagnostics) {
    return {
        type: 'tool.resultPayload',
        level: 'trace',
        conversationId: context?.conversationId,
        toolName: toolCall.name,
        message: () => `tool ${toolCall.name} result payload: ${diagnostics.summarizeObject(envelope)}`
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

function toolErrorSummary(error) {
    const validationErrors = Array.isArray(error?.errors)
        ? error.errors
        : Array.isArray(error?.patchError?.errors) ? error.patchError.errors : null
    if (!validationErrors) return null
    return truncateString(JSON.stringify(validationErrors.map(({path, rule, message}) => ({
        path, rule, message
    }))), MAX_ERROR_SUMMARY_CHARS)
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

module.exports = {createToolRegistry}
