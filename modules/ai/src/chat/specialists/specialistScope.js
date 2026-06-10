import {of} from 'rxjs'

function scopeInnerTools({innerTools, allowed, label}) {
    const innerSchemas = innerTools.schemas()
    const innerNames = new Set(innerSchemas.map(schema => schema.name))
    const missing = allowed.filter(name => !innerNames.has(name))
    if (missing.length) {
        throw new Error(`${label}: required inner tool(s) not registered: ${missing.join(', ')}`)
    }
    const allowedSet = new Set(allowed)
    return {
        allowedSchemas: innerSchemas.filter(schema => allowedSet.has(schema.name)),
        invokeTool$: (toolCall, context) => allowedSet.has(toolCall.name)
            ? innerTools.invoke$(toolCall, context)
            : of({ok: false, error: {code: 'TOOL_NOT_ALLOWED', message: `Tool ${toolCall.name} not allowed for this specialist`}})
    }
}

// Authorises tool calls whose recipeId arg must match the workflow's recipeId.
// The workflow signals its recipeId via context.recipeId per consult; this
// keeps the wrapper stable across calls while still enforcing scope per call.
function bindToolsToRecipe(invokeTool$, {boundTools}) {
    return (toolCall, context) => {
        if (!boundTools.has(toolCall.name)) return invokeTool$(toolCall, context)
        if (toolCall.input?.recipeId === context?.recipeId) return invokeTool$(toolCall, context)
        return of({
            ok: false,
            error: {
                code: 'RECIPE_SCOPE_VIOLATION',
                message: `${toolCall.name} restricted to recipeId=${context?.recipeId}; got ${toolCall.input?.recipeId}`
            }
        })
    }
}

export {bindToolsToRecipe, scopeInnerTools}
