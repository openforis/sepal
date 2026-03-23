const _ = require('lodash')
const log = require('#sepal/log').getLogger('tools')

const createRecipeTools = ({recipeClient, registry}) => [
    {
        name: 'recipe_list',
        description: 'List all recipes for the current user, optionally filtered by type or project',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'Filter by recipe type (e.g. MOSAIC, CLASSIFICATION)'},
                projectId: {type: 'string', description: 'Filter by project ID'}
            }
        },
        handler: async ({username, params}) => {
            const recipes = await recipeClient.listRecipes({username, ...params})
            return {success: true, data: recipes}
        }
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
        handler: async ({username, params}) => {
            const recipe = await recipeClient.loadRecipe({username, recipeId: params.recipeId})
            return {success: true, data: recipe}
        }
    },
    {
        name: 'recipe_create',
        description: 'Create a new recipe with the given type, name, and model parameters',
        parameters: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'Recipe type (e.g. MOSAIC, CLASSIFICATION, TIME_SERIES)'},
                name: {type: 'string', description: 'Display name for the recipe'},
                projectId: {type: 'string', description: 'Optional project ID to place the recipe in'},
                model: {type: 'object', description: 'Recipe model parameters (type-specific configuration)'}
            },
            required: ['type', 'name', 'model']
        },
        handler: async ({username, params}) => {
            const result = await recipeClient.saveRecipe({
                username,
                type: params.type,
                name: params.name,
                projectId: params.projectId,
                model: params.model
            })
            return {success: true, data: result}
        }
    },
    {
        name: 'recipe_save',
        description: 'Update an existing recipe. Merges the provided model with the existing one so partial updates work.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The recipe ID to update'},
                model: {type: 'object', description: 'Model parameters to merge into the existing recipe'}
            },
            required: ['recipeId', 'model']
        },
        handler: async ({username, params}) => {
            const existing = await recipeClient.loadRecipe({username, recipeId: params.recipeId})
            const mergedModel = _.merge({}, existing.model, params.model)
            const result = await recipeClient.saveRecipe({
                username,
                id: params.recipeId,
                type: existing.type,
                name: existing.name || existing.title,
                projectId: existing.projectId,
                model: mergedModel
            })
            return {success: true, data: result}
        }
    },
    {
        name: 'recipe_delete',
        description: 'Delete one or more recipes by their IDs',
        parameters: {
            type: 'object',
            properties: {
                recipeIds: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'Array of recipe IDs to delete'
                }
            },
            required: ['recipeIds']
        },
        handler: async ({username, params}) => {
            const result = await recipeClient.deleteRecipes({username, recipeIds: params.recipeIds})
            return {success: true, data: result}
        }
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
        handler: async ({username, params}) => {
            const result = await recipeClient.moveRecipes({
                username,
                recipeIds: params.recipeIds,
                projectId: params.projectId
            })
            return {success: true, data: result}
        }
    },
    {
        name: 'project_list',
        description: 'List all projects for the current user',
        parameters: {
            type: 'object',
            properties: {}
        },
        handler: async ({username}) => {
            const projects = await recipeClient.listProjects({username})
            return {success: true, data: projects}
        }
    },
    {
        name: 'project_create',
        description: 'Create a new project',
        parameters: {
            type: 'object',
            properties: {
                name: {type: 'string', description: 'Project name'},
                defaultAssetFolder: {type: 'string', description: 'Default GEE asset folder path'},
                defaultWorkspaceFolder: {type: 'string', description: 'Default workspace folder path'}
            },
            required: ['name']
        },
        handler: async ({username, params}) => {
            const result = await recipeClient.saveProject({username, ...params})
            return {success: true, data: result}
        }
    },
    {
        name: 'project_delete',
        description: 'Delete a project and all its recipes',
        parameters: {
            type: 'object',
            properties: {
                projectId: {type: 'string', description: 'Project ID to delete'}
            },
            required: ['projectId']
        },
        handler: async ({username, params}) => {
            const result = await recipeClient.deleteProject({username, projectId: params.projectId})
            return {success: true, data: result}
        }
    }
]

module.exports = {createRecipeTools}
