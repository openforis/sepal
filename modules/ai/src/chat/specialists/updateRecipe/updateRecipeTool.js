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
        description: 'Update ONE open recipe. `recipeId` = selected, or only-open (ask if multiple open + none selected). Id from runtime context, never chat history. `request` = the user\'s distilled goal in the user\'s language when clear (e.g. "speed up rendering", "remove residual clouds") — use the SAME phrasing across follow-up turns when the user is on the same goal. NOT raw user text; do NOT invent goals the user didn\'t state. `context` (optional) = factual conversation history relevant to this update: what was tried, what the user rejected, prior constraints they explicitly stated. Facts only — no editorializing ("maintain usability"), prompt/routing notes, or tool-behavior commentary. No field-level plans. No read-only preflight (describe_recipe / recipe_list / get_gui_context). One conceptual edit proceeds without confirmation. `instruction`: deprecated alias.',
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
