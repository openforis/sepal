const {catchError, defer, map, of} = require('rxjs')
const Ajv = require('ajv')
const addFormats = require('ajv-formats')

function createToolRegistry({tools}) {
    const byName = new Map(tools.map(tool => [tool.name, tool]))
    const validators = compileValidators(tools)

    return {schemas, invoke$}

    function schemas() {
        return tools.map(({name, description, parameters}) => ({name, description, parameters}))
    }

    function invoke$(toolCall, context) {
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

module.exports = {createToolRegistry}
