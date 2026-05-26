const {catchError, of} = require('rxjs')
const {map, tap} = require('rxjs/operators')
const {toEffectiveModel} = require('#recipes')
const {guiProductRequest$} = require('../../tools/guiProductRequest')
const {publishPrepareHandlePacketCompleted} = require('../specialistEvents')
const {buildHandlePacket} = require('../handlePacket')

// Prepares one handle-keyed packet per update attempt. Loads the current
// recipe via the GUI bridge, projects through toEffectiveModel, then delegates
// to the shared buildHandlePacket builder (same builder create uses) and
// stamps the concurrency token (baseModelHash) on the result.
function prepareHandlePacket$({guiRequests, bus, recipeId, recipeType, pickedHandles, context}) {
    return guiProductRequest$(guiRequests, context, 'load-recipe', {recipeId}).pipe(
        map(recipe => buildUpdatePacket({recipe, recipeType, pickedHandles})),
        tap(packet => publishOnSuccess({bus, conversationId: context?.conversationId, recipeType, packet})),
        catchError(error => of({ok: false, error: {code: error.code || 'TOOL_FAILED', message: error.message}}))
    )
}

function buildUpdatePacket({recipe, recipeType, pickedHandles}) {
    if (!recipe?.modelHash) {
        return {ok: false, error: {code: 'MISSING_MODEL_HASH', message: 'GUI load-recipe response is missing modelHash'}}
    }
    const effectiveModel = toEffectiveModel(recipeType, recipe.model)
    const result = buildHandlePacket({recipeType, effectiveModel, pickedHandles})
    if (!result.ok) return result
    return {ok: true, data: {baseModelHash: recipe.modelHash, ...result.data}}
}

function publishOnSuccess({bus, conversationId, recipeType, packet}) {
    if (!bus || !packet?.ok) return
    publishPrepareHandlePacketCompleted({
        bus, conversationId, recipeType,
        pickedHandles: packet.data.pickedHandles,
        dependentHandles: packet.data.dependentHandles,
        writableHandles: packet.data.writableHandles
    })
}

module.exports = {prepareHandlePacket$}
