// create_recipe — handle-based vertical slice.
//
//   recipe-type validation
//   -> pickHandles$              (one tool-free LLM call → handles; allowEmpty)
//   -> prepareCreatePacket$      (defaults → handle-keyed packet; required handles)
//   -> create specialist         (LLM loop, only create_recipe_values in scope,
//                                 workflow-bound fields injected from packet)
//   -> projectCreateOutcome      (timeline → user-facing envelope + diagnostic)
// JSON Pointer paths and patch mechanics stay below the GUI/log boundary.

const {createCreateWorkflow} = require('./createWorkflow')

const SUPPORTED_RECIPE_TYPES = ['MOSAIC']

function createRecipeTool({llm, bus, innerTools}) {
    const workflow = createCreateWorkflow({llm, bus, innerTools})

    return {
        name: 'create_recipe',
        description: 'Create ONE new recipe from natural language. Picks recipe fields, applies values to defaults, validates, and creates. Use for create/new — for editing an existing recipe use update_recipe instead. v1 supports MOSAIC.',
        directAnswer: true,
        parameters: {
            type: 'object',
            properties: {
                recipeType: {type: 'string', enum: SUPPORTED_RECIPE_TYPES},
                instruction: {type: 'string'},
                projectId: {type: 'string'},
                name: {type: 'string'}
            },
            required: ['recipeType', 'instruction'],
            additionalProperties: false
        },
        invoke$: ({recipeType, instruction, projectId, name}, context) =>
            workflow.run$({recipeType, instruction, projectId, name, context})
    }
}

module.exports = {createRecipeTool, SUPPORTED_RECIPE_TYPES}
