const {specialistPrompt} = require('../llmText/prompts')
const {runSpecialist$} = require('./runSpecialist')
const {scopeInnerTools} = require('./specialistScope')

// This module is ONLY for free-form `consult_*` specialist dispatcher tools
// (one tool per specialist). Recipe-type specialists are NOT registered here;
// they are reached through operation tools (`describe_recipe`, future
// `update_recipe`, `create_recipe`) that live in productTools.js and route to a
// recipe-type specialist via `recipeSpecialists.js`. That split keeps the
// orchestrator surface proportional to operations, not recipe-type count
// (DESIGN §5).
const MAP_SPECIALIST = {
    name: 'map',
    consultToolName: 'consult_map',
    consultToolDescription: 'Delegate to the map specialist for questions about the user\'s current map context: which area/view/AOI is selected, which recipe or layers are active, why the map looks empty. The specialist sees the same runtime GUI context and answers from it.',
    promptAsset: 'map',
    allowed: ['get_context', 'map_area_list', 'layer_list']
}

const SPECIALISTS = [MAP_SPECIALIST]

function specialistTools({llm, tracer, innerTools}) {
    return SPECIALISTS.map(definition => buildSpecialistTool({definition, llm, tracer, innerTools}))
}

function buildSpecialistTool({definition, llm, tracer, innerTools}) {
    const systemPrompt = specialistPrompt(definition.promptAsset)
    const {allowedSchemas, invokeTool$} = scopeInnerTools({
        innerTools,
        allowed: definition.allowed,
        label: `Specialist ${definition.name}`
    })

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
            llm, tracer,
            name: definition.name,
            systemPrompt,
            userText: question,
            allowedSchemas,
            invokeTool$,
            context
        })
    }
}

module.exports = {specialistTools}
