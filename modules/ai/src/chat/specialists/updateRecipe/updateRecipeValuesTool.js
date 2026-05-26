// Specialist-private. Deterministic handle-keyed recipe update: maps short
// semantic handles to internal recipe paths, diffs the requested value against
// the current effective model, generates RFC 6902 ops, and hands them to the
// GUI recipe-patch bridge. Rejects values outside the prepared writableHandles
// scope before any GUI work. Errors come back to the updater in handle terms;
// internal paths stay in logs and the wire envelope but never in handle-facing
// messages.

const {catchError, of} = require('rxjs')
const {mergeMap} = require('rxjs/operators')
const isEqual = require('lodash/isEqual')
const {getRecipeHandles, toEffectiveModel} = require('#recipes')
const {guiProductRequest$} = require('../../tools/guiProductRequest')
const {isChannelEmission, mapData} = require('../../channelEvents')
const {parsePointer, resolvePointer, PointerNotFound} = require('../../tools/jsonPointer')
const {
    applyHandleValuesToModel, checkApplicability, checkInactiveValues,
    checkUnknownHandles, checkWritableScope,
    invertByPath, mapErrorDetailsToHandles, resolveHandle
} = require('../handleValueIO')

// STALE_WRITE needs currentModelHash so the updater can decide whether to give
// up; everything else path-bearing (errors, details) is stripped before the
// envelope reaches the model — handleErrors is the model-facing surface.
const PATCH_ERROR_PASSTHROUGH = ['currentModelHash']

function updateRecipeValuesTool(guiRequests) {
    return {
        name: 'update_recipe_values',
        description: 'Set values for ONE recipe by handle name. Send {recipeId, values:{handle->value}}. The workflow supplies the concurrency token and writable handle set. The tool applies all values atomically and returns success or a handle-keyed error.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                baseModelHash: {type: 'string'},
                writableHandles: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'The allowed write scope for this attempt, carried verbatim from the prepared packet.'
                },
                values: {
                    type: 'object',
                    description: 'Handle-keyed values to set. Whole-array handles take the whole intended array; whole-object handles take the whole intended object.',
                    additionalProperties: true
                }
            },
            required: ['recipeId', 'baseModelHash', 'writableHandles', 'values'],
            additionalProperties: false
        },
        invoke$: ({recipeId, baseModelHash, writableHandles, values}, context) =>
            handleRequest$({guiRequests, context, recipeId, baseModelHash, writableHandles, values})
    }
}

function handleRequest$({guiRequests, context, recipeId, baseModelHash, writableHandles, values}) {
    const scopeError = checkWritableScope(values, writableHandles)
    if (scopeError) return of(scopeError)
    return guiProductRequest$(guiRequests, context, 'load-recipe', {recipeId}).pipe(
        mergeMap(value => isChannelEmission(value)
            ? of(value)
            : applyValues$({guiRequests, context, recipe: value, recipeId, baseModelHash, values})
        ),
        catchError(error => of({ok: false, error: {code: error.code || 'TOOL_FAILED', message: error.message}}))
    )
}

function applyValues$({guiRequests, context, recipe, recipeId, baseModelHash, values}) {
    const handlesByName = handleLookup(recipe?.type)
    if (!handlesByName) return of({ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: `Recipe type ${recipe?.type} has no handle catalog`}})
    const unknownError = checkUnknownHandles(values, handlesByName, recipe?.type)
    if (unknownError) return of(unknownError)
    // The GUI patch bridge applies operations to toEffectiveModel(type, stored),
    // not the raw stored model. Diff against the same projection so dormant
    // stored fields generate `add`, not `replace`.
    const effectiveModel = toEffectiveModel(recipe?.type, recipe?.model)
    const applicabilityError = checkApplicability({values, effectiveModel, handlesByName})
    if (applicabilityError) return of(applicabilityError)
    // Projection-survival guard: overlay the requested values onto effective,
    // project again, and reject any handle whose value didn't survive (the
    // selector item or schema condition that activates it isn't enabled).
    const desiredModel = applyHandleValuesToModel(effectiveModel, values, handlesByName)
    const projectedModel = toEffectiveModel(recipe?.type, desiredModel)
    const inactiveError = checkInactiveValues({values, projectedModel, handlesByName})
    if (inactiveError) return of(inactiveError)
    const handlesByPath = invertByPath(handlesByName)
    const {operations, changedHandles} = computeOperations({effectiveModel, values, handlesByName})
    if (!operations.length) return of(noopSuccess(recipe?.modelHash))
    return guiProductRequest$(guiRequests, context, 'recipe-patch', {recipeId, baseModelHash, operations}).pipe(
        mapData(data => successEnvelope({data, changedHandles, handlesByPath})),
        catchError(error => of({ok: false, error: toErrorEnvelope(error, handlesByPath)}))
    )
}

function handleLookup(recipeType) {
    const handles = getRecipeHandles(recipeType)
    return handles ? new Map(handles.map(handle => [handle.name, handle])) : null
}

function noopSuccess(modelHash) {
    return {ok: true, data: {summary: 'No changes needed.', modelHash, appliedHandles: [], invalidatedHandles: []}}
}

function successEnvelope({data, changedHandles, handlesByPath}) {
    return {
        ok: true,
        data: {
            summary: data?.summary || '',
            modelHash: data?.modelHash,
            appliedHandles: changedHandles,
            invalidatedHandles: mapInvalidationsToHandles(data?.invalidatedPaths || [], handlesByPath)
        }
    }
}

function computeOperations({effectiveModel, values, handlesByName}) {
    const changes = Object.entries(values)
        .map(([name, requestedValue]) => diffHandle({name, requestedValue, effectiveModel, handle: handlesByName.get(name)}))
        .filter(change => change !== null)
    return {
        operations: changes.map(change => change.operation),
        changedHandles: changes.map(change => change.handle)
    }
}

function diffHandle({name, requestedValue, effectiveModel, handle}) {
    const {exists, value: currentValue} = pathState(effectiveModel, handle.path)
    if (exists && isEqual(currentValue, requestedValue)) return null
    return {handle: name, operation: {op: exists ? 'replace' : 'add', path: handle.path, value: requestedValue}}
}

// Maps GUI-side invalidation paths back to handle names via the same ancestor
// walk used for validation-error attribution. Paths that don't map to any
// handle are dropped — never re-emitted as raw pointers.
function mapInvalidationsToHandles(paths, handlesByPath) {
    return distinct(paths.map(path => resolveHandle(path, handlesByPath)).filter(handle => handle !== null))
}

function distinct(list) {
    return [...new Set(list)]
}

function toErrorEnvelope(error, handlesByPath) {
    const handleErrors = mapErrorDetailsToHandles(error, handlesByPath)
    return {
        code: error.code || 'TOOL_FAILED',
        message: error.message,
        ...passthroughFields(error),
        ...(handleErrors ? {handleErrors} : {})
    }
}

function passthroughFields(error) {
    return PATCH_ERROR_PASSTHROUGH.reduce(
        (fields, name) => error[name] === undefined ? fields : {...fields, [name]: error[name]},
        {}
    )
}

function pathState(model, path) {
    try {
        return {exists: true, value: resolvePointer(model, parsePointer(path))}
    } catch (error) {
        if (error instanceof PointerNotFound) return {exists: false, value: undefined}
        throw error
    }
}

module.exports = {updateRecipeValuesTool}
