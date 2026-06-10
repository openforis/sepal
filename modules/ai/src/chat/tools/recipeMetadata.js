// Dispatcher-side lookup: resolves recipeId -> {id, type, name, projectId}
// via the GUI's `recipe-metadata` bridge handler. Cheaper than `recipe_load`
// (no model fetch, no gzip envelope) and never LLM-callable — used by
// describe_recipe / update_recipe / create_recipe to pick a per-type
// specialist prompt before invoking the inner LLM.

import {catchError, of} from 'rxjs'

import {mapData} from '../channelEvents.js'
import {guiProductRequest$} from './guiProductRequest.js'

function lookupRecipeMetadata$(guiRequests, context, recipeId) {
    return guiProductRequest$(guiRequests, context, 'recipe-metadata', {recipeId}).pipe(
        mapData(data => ({ok: true, data})),
        catchError(error => of({ok: false, error: {code: error.code || 'TOOL_FAILED', message: error.message}}))
    )
}

export {lookupRecipeMetadata$}
