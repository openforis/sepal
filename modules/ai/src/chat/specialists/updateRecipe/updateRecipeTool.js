// update_recipe — handle-based vertical slice.
//
//   recipe-metadata preflight
//   -> pickHandles$           (one tool-free LLM call → handles)
//   -> prepareHandlePacket$   (deterministic, handle-keyed packet)
//   -> updater specialist     (LLM loop, only update_recipe_values in scope,
//                              writableHandles + baseModelHash bound from
//                              the packet so the model cannot widen scope)
//   -> projectUpdateOutcome   (timeline → user-facing envelope + diagnostic)
// JSON Pointer paths and RFC 6902 mechanics stay below the tool boundary.

const {createUpdateWorkflow} = require('./updateWorkflow')

function updateRecipeTool({llm, bus, innerTools, guiRequests}) {
    const workflow = createUpdateWorkflow({llm, bus, guiRequests, innerTools})

    return {
        name: 'update_recipe',
        description: 'Update ONE current recipe from natural language. Specialist picks recipe fields, prepares the change, and applies it. Use for change/edit/modify/fix, including problem + action ("still clouds, remove them"). Do not call describe_recipe first.',
        directAnswer: true,
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                instruction: {type: 'string'}
            },
            required: ['recipeId', 'instruction'],
            additionalProperties: false
        },
        invoke$: ({recipeId, instruction}, context) => workflow.run$({recipeId, instruction, context})
    }
}

module.exports = {updateRecipeTool}
