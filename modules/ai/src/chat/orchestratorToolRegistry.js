// Composes the orchestrator's tool surface and the inner registry
// specialists see.

const {createToolRegistry} = require('./tools/registry')
const {sepalTools, specialistInnerTools} = require('./tools/sepalTools')
const {describeRecipeTool} = require('./specialists/recipeSpecialists')
const {specialistConsultationTools} = require('./specialists/specialistConsultationTools')

function createOrchestratorToolRegistry({guiRequests, llm, tracer, bus}) {
    const innerTools = createToolRegistry({tools: specialistInnerTools({guiRequests}), bus})
    const orchestratorToolList = [
        ...sepalTools({guiRequests}),
        describeRecipeTool({llm, tracer, innerTools}),
        ...specialistConsultationTools({llm, tracer, innerTools})
    ]
    return createToolRegistry({tools: orchestratorToolList, bus})
}

module.exports = {createOrchestratorToolRegistry}
