const {guiRequest} = require('./guiRequest')

const GUI_WRITE_TIMEOUT_MS = 60000

const validationError = errors => ({
    success: false,
    error: {
        code: 'VALIDATION_ERROR',
        message: `Recipe model validation failed:\n${errors.join('\n')}`
    }
})

const validateRecipeModel = ({recipeValidator, type, model}) => {
    if (!recipeValidator) return null
    const errors = recipeValidator.validateModel({type, model})
    return errors ? validationError(errors) : null
}

const createRecipeTools = ({recipeValidator}) => [
    {
        name: 'recipe_list',
        description: 'List recipes for the current user, optionally filtered by type or project. Returns the user\'s saved recipes from the GUI\'s state.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'Filter by recipe type (e.g. MOSAIC, CLASSIFICATION)'},
                projectId: {type: 'string', description: 'Filter by project ID'}
            }
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'list-recipes', params)
    },
    {
        name: 'recipe_load',
        description: 'Load the full contents of a recipe by its ID. Returns the recipe model (configuration) without UI state.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID to load'}
            },
            required: ['recipeId']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'load-recipe', {recipeId: params.recipeId})
    },
    {
        name: 'recipe_create',
        description: 'Create a new recipe from a complete recipe model. Call recipe_info first, start from its defaults, modify the relevant fields, and send the full resulting model here. The GUI saves it, registers it in the user\'s recipe list, and opens the recipe — no separate recipe_open call is needed.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'Recipe type (e.g. MOSAIC, CLASSIFICATION, TIME_SERIES)'},
                name: {type: 'string', description: 'REQUIRED. Display name for the recipe — derive a clear, concise human-readable name from the user\'s request (e.g. "Bangladesh mangroves 2020 mosaic"). Never omit this parameter.'},
                projectId: {type: 'string', description: 'Optional project ID to place the recipe in'},
                model: {type: 'object', description: 'Complete recipe model parameters (type-specific configuration), built from recipe_info.defaults plus intentional changes.'}
            },
            required: ['type', 'name', 'model']
        },
        handler: async ({params, request}) => {
            const invalid = validateRecipeModel({
                recipeValidator, type: params.type, model: params.model
            })
            if (invalid) return invalid
            return guiRequest(request, 'create-recipe', {
                type: params.type,
                name: params.name,
                projectId: params.projectId,
                model: params.model
            }, {timeoutMs: GUI_WRITE_TIMEOUT_MS})
        }
    },
    {
        name: 'recipe_save',
        description: 'Update an existing recipe. The provided model REPLACES the existing model in full — there is no merging. To make a partial change, call recipe_load first, modify the returned model, then send it back here. The GUI persists the new model and selects/opens the recipe — no separate recipe_open call is needed.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID to update'},
                model: {type: 'object', description: 'The full new recipe model. Replaces the existing model entirely.'}
            },
            required: ['recipeId', 'model']
        },
        handler: async ({params, request}) => {
            const loaded = await guiRequest(request, 'load-recipe', {recipeId: params.recipeId})
            if (loaded.success === false) return loaded
            const invalid = validateRecipeModel({
                recipeValidator, type: loaded.data?.type, model: params.model
            })
            if (invalid) return invalid
            return guiRequest(
                request,
                'save-recipe',
                {recipeId: params.recipeId, model: params.model},
                {timeoutMs: GUI_WRITE_TIMEOUT_MS}
            )
        }
    },
    {
        name: 'recipe_delete',
        description: 'DESTRUCTIVE: permanently deletes the listed recipes. Always confirm with the user before calling, naming the recipes that will be removed.',
        parameters: {
            type: 'object',
            properties: {
                recipeIds: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Array of recipe IDs to delete (from recipe_list)'
                }
            },
            required: ['recipeIds']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'delete-recipes', {recipeIds: params.recipeIds})
    },
    {
        name: 'recipe_move',
        description: 'Move one or more recipes to a different project',
        parameters: {
            type: 'object',
            properties: {
                recipeIds: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Array of recipe IDs to move'
                },
                projectId: {type: 'string', description: 'Target project ID'}
            },
            required: ['recipeIds', 'projectId']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'move-recipes', {recipeIds: params.recipeIds, projectId: params.projectId})
    },
    {
        name: 'recipe_open',
        description: 'Open a recipe in the SEPAL interface. Use only for opening recipes the user already has saved — recipe_create and recipe_save open the recipe automatically.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID to open'}
            },
            required: ['recipeId']
        },
        handler: async ({params, send}) => {
            send({type: 'gui-action', action: 'open', recipeId: params.recipeId})
            return {success: true, data: {action: 'open', recipeId: params.recipeId}}
        }
    },
    {
        name: 'recipe_close',
        description: 'Tell the browser to close a recipe tab',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID to close'}
            },
            required: ['recipeId']
        },
        handler: async ({params, send}) => {
            send({type: 'gui-action', action: 'close', recipeId: params.recipeId})
            return {success: true, data: {action: 'close', recipeId: params.recipeId}}
        }
    }
]

module.exports = {createRecipeTools}
