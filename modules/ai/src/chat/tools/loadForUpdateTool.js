// Specialist-private. Replaces raw recipe_load for update specialists by
// returning a bounded edit closure: baseModelHash + the deterministic
// {intent, currentValues, dependentPaths, guidance} the spec resolves from
// the instruction + current effective model. The specialist composes ONE
// atomic recipe_patch operations array against the closure.

const {catchError, of} = require('rxjs')
const {getRecipeSpec, getRecipeUpdateClosure, toEffectiveModel} = require('#recipes')
const {mapData} = require('../channelEvents')
const {guiProductRequest$} = require('./guiProductRequest')

function loadForUpdateTool(guiRequests) {
    return {
        name: 'load_for_update',
        description: 'Load ONE recipe + return a deterministic edit closure for the requested instruction. Returns {baseModelHash, intent, currentValues:{path->value}, dependentPaths:[path], guidance:[rule]}. Use baseModelHash on the next recipe_patch. Plan ONE atomic operations array touching only dependentPaths, satisfying guidance. intent=broad -> closure is whole-model; narrow your patch yourself.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                instruction: {type: 'string'}
            },
            required: ['recipeId', 'instruction'],
            additionalProperties: false
        },
        invoke$: ({recipeId, instruction}, context) =>
            guiProductRequest$(guiRequests, context, 'load-recipe', {recipeId}).pipe(
                mapData(recipe => buildEnvelope(recipe, instruction)),
                catchError(error => of({
                    ok: false,
                    error: {code: error.code || 'TOOL_FAILED', message: error.message}
                }))
            )
    }
}

function buildEnvelope(recipe, instruction) {
    if (!recipe?.modelHash) {
        return {ok: false, error: {code: 'MISSING_MODEL_HASH', message: 'GUI load-recipe response is missing modelHash'}}
    }
    const spec = getRecipeSpec(recipe.type)
    if (!spec?.updateClosure) {
        return {
            ok: false,
            error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: `Recipe type ${recipe.type} has no update closure`}
        }
    }
    const effectiveModel = toEffectiveModel(recipe.type, recipe.model)
    const closure = getRecipeUpdateClosure(recipe.type, {instruction, effectiveModel})
    return {ok: true, data: {baseModelHash: recipe.modelHash, ...closure}}
}

module.exports = {loadForUpdateTool}
