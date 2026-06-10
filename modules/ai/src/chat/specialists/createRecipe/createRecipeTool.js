// create_recipe — handle-based vertical slice.
//
//   recipe-type validation
//   -> pickHandles$              (one tool-free LLM call → handles; allowEmpty)
//   -> prepareCreatePacket$      (defaults → handle-keyed packet; required handles)
//   -> create specialist         (LLM loop, create_recipe_values + lookup tools
//                                 in scope; workflow-bound fields injected)
//   -> projectCreateOutcome      (timeline → user-facing envelope + diagnostic)
// JSON Pointer paths and patch mechanics stay below the GUI/log boundary.

import {createCreateWorkflow} from './createWorkflow.js'

const SUPPORTED_RECIPE_TYPES = ['MOSAIC']

function createRecipeTool({llm, bus, innerTools}) {
    const workflow = createCreateWorkflow({llm, bus, innerTools})

    return {
        name: 'create_recipe',
        description: 'Create ONE new recipe from natural language. For editing an existing recipe use `update_recipe`. v1: MOSAIC only.',
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

export {createRecipeTool, SUPPORTED_RECIPE_TYPES}
