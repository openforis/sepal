// Wraps the shared inner tool registry so a single specialist only sees
// its allowed tool subset — both in schemas() and via a blocked-call
// envelope on invocations of disallowed tools.

const {of} = require('rxjs')

// Builds the schema list and the defence-in-depth scoped invokeTool$ a
// specialist needs to drive runSpecialist$ against the shared inner registry.
// The inner LLM is told what's allowed via allowedSchemas; invokeTool$
// enforces the same allow-list even if the LLM ignores the schema list.
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

module.exports = {scopeInnerTools}
