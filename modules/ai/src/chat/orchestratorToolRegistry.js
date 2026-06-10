// Composes the orchestrator's tool surface and the inner registry
// specialists see.

import {createRecipeTool} from './specialists/createRecipe/createRecipeTool.js'
import {describeRecipeTool} from './specialists/describeRecipe.js'
import {specialistConsultationTools} from './specialists/specialistConsultationTools.js'
import {updateRecipeTool} from './specialists/updateRecipe/updateRecipeTool.js'
import {createToolRegistry} from './tools/registry.js'
import {sepalTools, specialistInnerTools} from './tools/sepalTools.js'

function createOrchestratorToolRegistry({guiRequests, llm, bus, diagnostics}) {
    const innerTools = createToolRegistry({tools: specialistInnerTools({guiRequests, bus}), bus, diagnostics})
    const orchestratorToolList = [
        ...sepalTools({guiRequests}),
        describeRecipeTool({llm, bus, innerTools, guiRequests}),
        updateRecipeTool({llm, bus, innerTools, guiRequests}),
        createRecipeTool({llm, bus, innerTools}),
        ...specialistConsultationTools({llm, bus, innerTools})
    ]
    return createToolRegistry({tools: orchestratorToolList, bus, diagnostics})
}

export {createOrchestratorToolRegistry}
