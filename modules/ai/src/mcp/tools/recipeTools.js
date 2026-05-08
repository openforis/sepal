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

const createRecipeTools = ({recipeValidator, registry}) => {
    const recipeTypeIds = registry.listSchemas().map(s => s.id)
    return [{
        name: 'recipe_list',
        description: 'List user\'s saved recipes from GUI state. Optional filter by type / project.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', enum: recipeTypeIds, description: 'Filter by recipe type id.'},
                projectId: {type: 'string', description: 'Filter by project id.'}
            }
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'list-recipes', params)
    },
    {
        name: 'recipe_load',
        description: 'Load a recipe\'s model (configuration, no UI state) by id.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id.'}
            },
            required: ['recipeId']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'load-recipe', {recipeId: params.recipeId})
    },
    {
        name: 'recipe_create',
        description: 'Create a recipe from a complete model. Workflow: recipe_info → start from its defaults → modify relevant fields → send full model. GUI saves, registers, and opens it — do NOT call recipe_open after. If recipe\'s project ≠ selected project, ask before calling project_select. Never switch silently.',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', enum: recipeTypeIds, description: 'Recipe type id.'},
                name: {type: 'string', description: 'REQUIRED. Concise display name derived from the request (e.g. "Bangladesh mangroves 2020 mosaic"). Never omit.'},
                projectId: {type: 'string', description: 'Project id. Always confirm with user (or confirm none) — never silently omit or pick. Use project_list to present options.'},
                model: {type: 'object', description: 'Complete model. Built from recipe_info.defaults + intentional changes.'}
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
        description: 'Update an existing recipe. Model REPLACES existing in full — no merging. For partial changes: recipe_load → modify → send back. GUI persists + opens — do NOT call recipe_open after. If recipe\'s project ≠ selected project, ask before calling project_select. Never switch silently.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id to update.'},
                model: {type: 'object', description: 'Full new model. Replaces existing entirely.'}
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
        description: 'DESTRUCTIVE: permanently deletes the listed recipes. Always confirm with user first, naming each recipe.',
        parameters: {
            type: 'object',
            properties: {
                recipeIds: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Recipe ids to delete (from recipe_list).'
                }
            },
            required: ['recipeIds']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'delete-recipes', {recipeIds: params.recipeIds})
    },
    {
        name: 'recipe_move',
        description: 'Move recipes to a different project. If target ≠ selected project, ask before calling project_select. Never switch silently.',
        parameters: {
            type: 'object',
            properties: {
                recipeIds: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Recipe ids to move.'
                },
                projectId: {type: 'string', description: 'Target project id.'}
            },
            required: ['recipeIds', 'projectId']
        },
        handler: async ({params, request}) =>
            guiRequest(request, 'move-recipes', {recipeIds: params.recipeIds, projectId: params.projectId})
    },
    {
        name: 'recipe_open',
        description: 'Open an existing recipe in SEPAL. **DO NOT call after recipe_create / recipe_save — they auto-open.** Only use when user asks to open a previously saved recipe (typically from recipe_list). If recipe\'s project ≠ selected project, ask before calling project_select. Never switch silently.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id to open.'}
            },
            required: ['recipeId']
        },
        handler: async ({params, send}) => {
            send({type: 'gui-action', action: 'open', params: {recipeId: params.recipeId}})
            return {success: true, data: {action: 'open', recipeId: params.recipeId}}
        }
    },
    {
        name: 'recipe_close',
        description: 'Close a recipe tab in the browser.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'Recipe id to close.'}
            },
            required: ['recipeId']
        },
        handler: async ({params, send}) => {
            send({type: 'gui-action', action: 'close', params: {recipeId: params.recipeId}})
            return {success: true, data: {action: 'close', recipeId: params.recipeId}}
        }
    }]
}

module.exports = {createRecipeTools}
