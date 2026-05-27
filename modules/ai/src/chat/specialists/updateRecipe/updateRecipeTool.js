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
        description: 'Update ONE current open recipe. Use the selected recipe, or the only open recipe. Pass `request` close to the user\'s latest recipe-edit wording (problem + action like "still clouds, remove them" or "too slow, fix it" is fine). Pass `context` only as neutral conversation context (e.g. "follow-up to slow rendering"); do not put field-level settings in `context` unless the user named them. Do not invent a field-level plan. Do not call describe_recipe first. `instruction` is a deprecated alias for `request`.',
        directAnswer: true,
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                request: {type: 'string'},
                context: {type: 'string'},
                instruction: {type: 'string'}
            },
            required: ['recipeId'],
            additionalProperties: false
        },
        invoke$: (args, runtimeContext) => workflow.run$({
            recipeId: args.recipeId,
            request: args.request ?? args.instruction,
            contextText: args.context,
            context: runtimeContext
        })
    }
}

module.exports = {updateRecipeTool}
