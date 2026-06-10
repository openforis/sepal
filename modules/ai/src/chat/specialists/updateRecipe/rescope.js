// Validation-rescope: when update_recipe_values fails with a VALIDATION_FAILED
// whose handleErrors name a known recipe handle that the picker / constraint
// closure missed, expand the writable set to include it and try once more.
//
// Whitelist is VALIDATION_FAILED only — INACTIVE_VALUE points at a companion
// selector that needs enabling (not a new writable handle); STALE_WRITE wants
// a user retry; HANDLE_OUT_OF_SCOPE means the model invented handles;
// TOOL_FAILED is opaque infrastructure failure.

import {getRecipeHandles} from '#sepal/recipes'

function rescopeCandidates(outcome, packet, recipeType) {
    if (outcome.succeeded || !outcome.attempted) return null
    const error = outcome.lastError
    if (error?.code !== 'VALIDATION_FAILED') return null
    if (!Array.isArray(error.handleErrors) || !error.handleErrors.length) return null
    const handles = getRecipeHandles(recipeType)
    if (!handles) return null
    const known = new Set(handles.map(handle => handle.name))
    const writable = new Set(packet.writableHandles)
    const missing = distinct(
        error.handleErrors
            .map(entry => entry?.handle)
            .filter(handle => typeof handle === 'string' && known.has(handle) && !writable.has(handle))
    )
    return missing.length ? missing : null
}

// Factual only — the updater's system prompt already says context is
// reference, not instructions. No "preserve original goal" directives here.
function appendRescopeContext(prior, missingHandles, error) {
    const facts = (error?.handleErrors || [])
        .filter(entry => missingHandles.includes(entry.handle))
        .map(entry => `${entry.handle}: ${entry.message}`)
        .join('; ')
    const note = `Previous update attempt failed validation: ${facts}. Writable scope was expanded to include the validation handle(s).`
    return prior ? `${prior}\n\n${note}` : note
}

function combineTimelines(priorTimeline, currentTimeline) {
    if (!priorTimeline || !priorTimeline.length) return currentTimeline
    return [...priorTimeline, ...currentTimeline]
}

function distinct(list) {
    return [...new Set(list)]
}

export {appendRescopeContext, combineTimelines, rescopeCandidates}
