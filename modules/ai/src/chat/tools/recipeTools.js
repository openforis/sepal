// recipe_list and recipe_load tools. recipe_list returns the user's
// saved recipes; recipe_load returns one full recipe and is
// specialist-private (kept off the orchestrator surface).

const {map} = require('rxjs')
const {projectLoadedRecipe} = require('./recipeProjection')
const {guiProductRequest$} = require('./guiProductRequest')

function recipeTools(guiRequests) {
    return [
        recipeListTool(guiRequests),
        recipeLoadTool(guiRequests)
    ]
}

function recipeListTool(guiRequests) {
    return {
        name: 'recipe_list',
        description: 'List saved recipes -> id, type, name, projectId. Use for "list/show recipes" requests; these summaries answer such requests directly. Optional filters: type, projectId. id & projectId are internal handles for later tool calls; don\'t display ids unless user explicitly asks. After a recipe_list for a plain list request, answer from this result. Don\'t call project_list unless user explicitly asks for projects/project names, grouping/filtering by project, or a project-changing op needs project resolution.',
        parameters: {
            type: 'object',
            properties: {type: {type: 'string'}, projectId: {type: 'string'}},
            additionalProperties: false
        },
        invoke$: (input, context) =>
            guiProductRequest$(guiRequests, context, 'list-recipes', recipeFilters(input)).pipe(
                map(recipes => recipes.map(recipeSummary))
            )
    }
}

function recipeLoadTool(guiRequests) {
    return {
        name: 'recipe_load',
        description: 'Load ONE recipe for inspection/editing -> identity + projected model. Not for listing recipes; use recipe_list. path = JSON Pointer into model (optional); heavy arrays return omitted markers.',
        parameters: {
            type: 'object',
            properties: {recipeId: {type: 'string'}, path: {type: 'string'}},
            required: ['recipeId'],
            additionalProperties: false
        },
        invoke$: (input, context) =>
            guiProductRequest$(guiRequests, context, 'load-recipe', {recipeId: input.recipeId}).pipe(
                map(recipe => projectLoadedRecipe(recipe, input.path))
            )
    }
}

function recipeFilters(input) {
    const filters = {}
    if (input.type !== undefined) filters.type = input.type
    if (input.projectId !== undefined) filters.projectId = input.projectId
    return filters
}

function recipeSummary(recipe) {
    const summary = {id: recipe.id, type: recipe.type, name: recipeName(recipe)}
    if (recipe.projectId) summary.projectId = recipe.projectId
    return summary
}

function recipeName(recipe) {
    return recipe.name || recipe.title || recipe.placeholder
}

module.exports = {recipeTools, recipeListTool, recipeLoadTool}
