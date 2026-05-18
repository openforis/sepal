const {createToolRegistry} = require('./tools/registry')
const {sepalTools, specialistInnerTools} = require('./tools/sepalTools')
const {describeRecipeTool} = require('./specialists/recipeSpecialists')
const {specialistConsultationTools} = require('./specialists/specialistConsultationTools')

function createOrchestratorToolRegistry({guiRequests, llm, tracer, bus}) {
    // Inner registry holds specialist-visible tools (recipe_load lives here).
    // The outer registry is the orchestrator's surface and substitutes
    // describe_recipe for raw recipe_load.
    const innerTools = createToolRegistry({tools: specialistInnerTools({guiRequests}), bus})
    const orchestratorToolList = [
        ...sepalTools({guiRequests}),
        describeRecipeTool({llm, tracer, innerTools}),
        ...specialistConsultationTools({llm, tracer, innerTools})
    ]
    return createToolRegistry({tools: orchestratorToolList, bus})
}

module.exports = {createOrchestratorToolRegistry}
