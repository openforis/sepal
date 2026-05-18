// Recipe tools: recipe_list (saved recipes summary), recipe_open
// (select one in the GUI), recipe_load (full recipe, specialist-private).

const {projectLoadedRecipe} = require('./recipeProjection')
const {guiProductRequest$} = require('./guiProductRequest')
const {mapData} = require('../channelEvents')

function recipeTools(guiRequests) {
    return [
        recipeListTool(guiRequests),
        recipeOpenTool(guiRequests),
        recipeLoadTool(guiRequests)
    ]
}

function recipeListTool(guiRequests) {
    return {
        name: 'recipe_list',
        description: 'List saved recipes -> id, type, name, projectId, updateTime/creationTime when available. Use for "list/show recipes" requests and to resolve a recipe for follow-up actions; for "latest", choose the highest updateTime, falling back to creationTime. id & projectId are internal handles for later tool calls; don\'t display ids unless user explicitly asks. After a recipe_list for a plain list request, answer from this result. Don\'t call project_list unless user explicitly asks for projects/project names, grouping/filtering by project, or a project-changing op needs project resolution.',
        parameters: {
            type: 'object',
            properties: {type: {type: 'string'}, projectId: {type: 'string'}},
            additionalProperties: false
        },
        invoke$: (input, context) =>
            guiProductRequest$(guiRequests, context, 'list-recipes', recipeFilters(input)).pipe(
                mapData(recipes => recipes.map(recipeSummary))
            )
    }
}

function recipeOpenTool(guiRequests) {
    return {
        name: 'recipe_open',
        description: 'Open/select ONE existing saved recipe in the user GUI. Use for requests to open, show, switch to, or select a known recipe. Resolve recipeId first with recipe_list or current GUI context when needed. Does not describe or inspect the recipe contents.',
        parameters: {
            type: 'object',
            properties: {recipeId: {type: 'string'}},
            required: ['recipeId'],
            additionalProperties: false
        },
        invoke$: (input, context) =>
            guiProductRequest$(guiRequests, context, 'open', {recipeId: input.recipeId})
    }
}

function recipeLoadTool(guiRequests) {
    return {
        name: 'recipe_load',
        description: 'Load ONE recipe for inspection/editing -> identity + effective model (dormant sub-config fields stripped per recipe spec). Not for listing recipes; use recipe_list. path = JSON Pointer into the effective model (optional); paths into dormant/stripped fields return no value; heavy CLASSIFICATION arrays return omitted markers.',
        parameters: {
            type: 'object',
            properties: {recipeId: {type: 'string'}, path: {type: 'string'}},
            required: ['recipeId'],
            additionalProperties: false
        },
        invoke$: (input, context) =>
            guiProductRequest$(guiRequests, context, 'load-recipe', {recipeId: input.recipeId}).pipe(
                mapData(recipe => projectLoadedRecipe(recipe, input.path))
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
    if (recipe.updateTime !== undefined) summary.updateTime = recipe.updateTime
    if (recipe.creationTime !== undefined) summary.creationTime = recipe.creationTime
    return summary
}

function recipeName(recipe) {
    return recipe.name || recipe.title || recipe.placeholder
}

module.exports = {recipeTools, recipeListTool, recipeOpenTool, recipeLoadTool}
