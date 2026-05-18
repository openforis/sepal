// Composes the orchestrator's tool surface — SEPAL product tools, the
// specialist-backed describe_recipe (substituting for raw recipe_load),
// and specialist consultation tools — and builds the inner registry that
// specialists see during their inner-loop calls.

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
