const {of} = require('rxjs')
const {specialistPrompt} = require('../llmText/prompts')
const {runSpecialist$} = require('./runSpecialist')

const MAP_SPECIALIST = {
    name: 'map',
    consultToolName: 'consult_map',
    consultToolDescription: 'Delegate to the map specialist for questions about the user\'s current map context: which area/view/AOI is selected, which recipe or layers are active, why the map looks empty. The specialist sees the same runtime GUI context and answers from it.',
    promptAsset: 'map',
    allowed: ['get_context']
}

const SPECIALISTS = [MAP_SPECIALIST]

function specialistTools({llm, tracer, bus, innerTools}) {
    return SPECIALISTS.map(definition => buildSpecialistTool({definition, llm, tracer, bus, innerTools}))
}

function buildSpecialistTool({definition, llm, tracer, bus, innerTools}) {
    const systemPrompt = specialistPrompt(definition.promptAsset)
    const innerSchemas = innerTools.schemas()
    const innerNames = new Set(innerSchemas.map(schema => schema.name))
    const missing = definition.allowed.filter(name => !innerNames.has(name))
    if (missing.length) {
        throw new Error(`Specialist ${definition.name}: allowed tool(s) not registered: ${missing.join(', ')}`)
    }
    const allowedSet = new Set(definition.allowed)
    const allowedSchemas = innerSchemas.filter(schema => allowedSet.has(schema.name))

    return {
        name: definition.consultToolName,
        description: definition.consultToolDescription,
        parameters: {
            type: 'object',
            properties: {question: {type: 'string'}},
            required: ['question'],
            additionalProperties: false
        },
        invoke$: ({question}, context) => runSpecialist$({
            llm, tracer, bus,
            name: definition.name,
            systemPrompt,
            userText: question,
            allowedSchemas,
            invokeTool$: scopedInvokeTool$(allowedSet, innerTools),
            context
        })
    }
}

// Defence in depth: even if the inner LLM ignores the schema list and tries to
// call something outside the allowed set, we don't let it reach the registry.
function scopedInvokeTool$(allowedSet, innerTools) {
    return (toolCall, context) => allowedSet.has(toolCall.name)
        ? innerTools.invoke$(toolCall, context)
        : of({ok: false, error: {code: 'TOOL_NOT_ALLOWED', message: `Tool ${toolCall.name} not allowed for this specialist`}})
}

module.exports = {specialistTools}
