// Composes the orchestrator's tool surface and the inner registry
// specialists see.

const {createToolRegistry} = require('./tools/registry')
const {sepalTools, specialistInnerTools} = require('./tools/sepalTools')
const {describeRecipeTool} = require('./specialists/recipeSpecialists')
const {specialistConsultationTools} = require('./specialists/specialistConsultationTools')

function createOrchestratorToolRegistry({guiRequests, llm, bus, diagnostics}) {
    const innerTools = createToolRegistry({tools: specialistInnerTools({guiRequests}), bus, diagnostics})
    const orchestratorToolList = [
        ...sepalTools({guiRequests}),
        describeRecipeTool({llm, bus, innerTools}),
        ...specialistConsultationTools({llm, bus, innerTools})
    ]
    return createToolRegistry({tools: orchestratorToolList, bus, diagnostics})
}

module.exports = {createOrchestratorToolRegistry}
