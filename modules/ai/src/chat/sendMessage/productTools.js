const {map, of} = require('rxjs')
const {shapeTurnContext} = require('./turnContext')
const {projectLoadedRecipe} = require('./recipeProjection')

function productTools({guiRequests}) {
    return [
        getContextTool(),
        recipeListTool(guiRequests),
        projectListTool(guiRequests),
        recipeLoadTool(guiRequests)
    ]
}

function getContextTool() {
    return {
        name: 'get_context',
        description: "User's current GUI state: active section, selected & open recipes/projects/apps, map view.",
        parameters: {type: 'object', properties: {}, additionalProperties: false},
        invoke$: (_input, context) => of(contextSnapshot(context?.selection))
    }
}

function contextSnapshot(selection) {
    const shaped = shapeTurnContext(selection)
    return shaped
        ? {source: 'turn_snapshot', available: true, selection: shaped}
        : {source: 'turn_snapshot', available: false}
}

function recipeListTool(guiRequests) {
    return {
        name: 'recipe_list',
        description: 'List saved recipes → id, type, name, projectId. Optional filters: type, projectId.',
        parameters: {
            type: 'object',
            properties: {type: {type: 'string'}, projectId: {type: 'string'}},
            additionalProperties: false
        },
        invoke$: (input, context) =>
            guiRequest$(guiRequests, context, 'list-recipes', recipeFilters(input)).pipe(
                map(recipes => recipes.map(recipeSummary))
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
    const summary = {id: recipe.id, type: recipe.type, name: recipe.name}
    if (recipe.projectId !== undefined) summary.projectId = recipe.projectId
    return summary
}

function projectListTool(guiRequests) {
    return {
        name: 'project_list',
        description: 'List projects → id, name.',
        parameters: {type: 'object', properties: {}, additionalProperties: false},
        invoke$: (_input, context) =>
            guiRequest$(guiRequests, context, 'list-projects', {}).pipe(
                map(projects => projects.map(projectSummary))
            )
    }
}

function projectSummary(project) {
    return {id: project.id, name: project.name}
}

function recipeLoadTool(guiRequests) {
    return {
        name: 'recipe_load',
        description: 'Load recipe → identity + projected model. path = JSON Pointer into model (optional); heavy arrays return omitted markers.',
        parameters: {
            type: 'object',
            properties: {recipeId: {type: 'string'}, path: {type: 'string'}},
            required: ['recipeId'],
            additionalProperties: false
        },
        invoke$: (input, context) =>
            guiRequest$(guiRequests, context, 'load-recipe', {recipeId: input.recipeId}).pipe(
                map(recipe => projectLoadedRecipe(recipe, input.path))
            )
    }
}

function guiRequest$(guiRequests, context, action, params) {
    return guiRequests.request$({
        channel: context.channel,
        clientId: context.clientId,
        subscriptionId: context.subscriptionId,
        action,
        params
    })
}

module.exports = {productTools}
