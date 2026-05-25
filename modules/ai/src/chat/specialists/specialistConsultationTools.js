const {specialistPrompt} = require('../llmText/prompts')
const {createSpecialistRuntime, answerOnly} = require('./runSpecialist')
const {scopeInnerTools} = require('./specialistScope')

const MAP_SPECIALIST = {
    name: 'map',
    consultToolName: 'consult_map',
    consultToolDescription: 'Delegate to the map specialist for questions about the user\'s current map context: which area/view/AOI is selected, which recipe or layers are active, why the map looks empty. The specialist sees the same runtime GUI context and answers from it.',
    promptAsset: 'map',
    allowed: ['get_gui_context', 'map_area_list', 'layer_list']
}

const SPECIALISTS = [MAP_SPECIALIST]

function specialistConsultationTools({llm, bus, innerTools}) {
    return SPECIALISTS.map(definition => buildSpecialistTool({definition, llm, bus, innerTools}))
}

function buildSpecialistTool({definition, llm, bus, innerTools}) {
    const scope = scopeInnerTools({innerTools, allowed: definition.allowed, label: `Specialist ${definition.name}`})
    const runtime = createSpecialistRuntime({
        llm, bus,
        name: definition.name,
        systemPrompt: specialistPrompt(definition.promptAsset),
        tools: {schemas: scope.allowedSchemas, invoke$: scope.invokeTool$}
    })

    return {
        name: definition.consultToolName,
        description: definition.consultToolDescription,
        directAnswer: true,
        parameters: {
            type: 'object',
            properties: {question: {type: 'string'}},
            required: ['question'],
            additionalProperties: false
        },
        invoke$: ({question}, context) =>
            runtime.consult$({userText: question, context}).pipe(answerOnly())
    }
}

module.exports = {specialistConsultationTools}
