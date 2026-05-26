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
const {mapData} = require('../../channelEvents')
const {parsePointer, resolvePointer, PointerNotFound} = require('../../tools/jsonPointer')
const {applicabilityConflictFor, isSelectorHandle, scopeIndexFromHandles, scopeValueIn} = require('./applicability')

// STALE_WRITE needs currentModelHash so the updater can decide whether to give
// up; everything else path-bearing (errors, details) is stripped before the
// envelope reaches the model — handleErrors is the model-facing surface.
const PATCH_ERROR_PASSTHROUGH = ['currentModelHash']

function updateRecipeValuesTool(guiRequests) {
    return {
        name: 'update_recipe_values',
        description: 'Set values for ONE recipe by handle name. Send {recipeId, baseModelHash, writableHandles, values:{handle->value}}. values is a handle-keyed object; only handles in writableHandles are accepted. The tool applies all values atomically and returns success or a handle-keyed error.',
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
        mergeMap(recipe => applyValues$({guiRequests, context, recipe, recipeId, baseModelHash, values})),
        catchError(error => of({ok: false, error: {code: error.code || 'TOOL_FAILED', message: error.message}}))
    )
}

function checkWritableScope(values, writableHandles) {
    const writable = new Set(writableHandles)
    const outOfScope = Object.keys(values || {}).filter(handle => !writable.has(handle))
    if (!outOfScope.length) return null
    return {
        ok: false,
        error: {
            code: 'HANDLE_OUT_OF_SCOPE',
            message: `Handle(s) not in writableHandles: ${outOfScope.join(', ')}`,
            handles: outOfScope
        }
    }
}

function applyValues$({guiRequests, context, recipe, recipeId, baseModelHash, values}) {
    const handlesByName = handleLookup(recipe?.type)
    if (!handlesByName) return of({ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: `Recipe type ${recipe?.type} has no handle catalog`}})
    const unknown = Object.keys(values).filter(handle => !handlesByName.has(handle))
    if (unknown.length) return of(unknownHandleEnvelope({recipeType: recipe?.type, unknown}))
    // The GUI patch bridge applies operations to toEffectiveModel(type, stored),
    // not the raw stored model. Diff against the same projection so dormant
    // stored fields generate `add`, not `replace`.
    const effectiveModel = toEffectiveModel(recipe?.type, recipe?.model)
    const applicabilityError = checkApplicability({values, effectiveModel, handlesByName})
    if (applicabilityError) return of(applicabilityError)
    const handlesByPath = invertByPath(handlesByName)
    const {operations, changedHandles} = computeOperations({effectiveModel, values, handlesByName})
    if (!operations.length) return of(noopSuccess(recipe?.modelHash))
    return guiProductRequest$(guiRequests, context, 'recipe-patch', {recipeId, baseModelHash, operations}).pipe(
        mapData(data => successEnvelope({data, changedHandles, handlesByPath})),
        catchError(error => of({ok: false, error: toErrorEnvelope(error, handlesByPath)}))
    )
}

// In-process rejection for selector items whose appliesTo is not satisfied by
// the post-update scope handle (values overlay the current model so a write
// that fixes both the selector and its prerequisite in the same call succeeds).
// toEffectiveModel would otherwise silently strip the inapplicable item — this
// surfaces the conflict in handle terms before any patch.
function checkApplicability({values, effectiveModel, handlesByName}) {
    const scopeIndex = scopeIndexFromHandles(handlesByName)
    const scopeValueOf = scopeHandle => scopeHandle.name in values
        ? values[scopeHandle.name]
        : scopeValueIn(effectiveModel, scopeHandle)
    const handleErrors = []
    for (const [selectorName, requestedValue] of Object.entries(values)) {
        const selectorHandle = handlesByName.get(selectorName)
        if (!isSelectorHandle(selectorHandle)) continue
        if (!Array.isArray(requestedValue)) continue
        for (const itemValue of requestedValue) {
            const item = selectorHandle.allowedItems.find(allowedItem => allowedItem?.value === itemValue)
            if (!item) continue
            const conflict = applicabilityConflictFor(item, scopeIndex, scopeValueOf)
            if (conflict) handleErrors.push(applicabilityErrorMessage(selectorName, item, conflict))
        }
    }
    if (!handleErrors.length) return null
    return {
        ok: false,
        error: {
            code: 'APPLICABILITY_VIOLATION',
            message: 'One or more requested values are not applicable to the current recipe state.',
            handleErrors
        }
    }
}

function applicabilityErrorMessage(handle, item, conflict) {
    const required = conflict.missingKeys.map(key => conflict.scopeHandle.valueLabels?.[key] || key).join(' or ')
    return {handle, message: `${item.label} requires ${required} in ${conflict.scopeHandle.label.toLowerCase()}.`}
}

function handleLookup(recipeType) {
    const handles = getRecipeHandles(recipeType)
    return handles ? new Map(handles.map(handle => [handle.name, handle])) : null
}

function invertByPath(handlesByName) {
    return new Map([...handlesByName.values()].map(handle => [handle.path, handle.name]))
}

function unknownHandleEnvelope({recipeType, unknown}) {
    return {
        ok: false,
        error: {
            code: 'UNKNOWN_HANDLE',
            message: `Unknown handle(s) for ${recipeType}: ${unknown.join(', ')}`,
            handles: unknown
        }
    }
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
    const sourceDetails = Array.isArray(error.errors) ? error.errors
        : Array.isArray(error.details) ? error.details
        : null
    return {
        code: error.code || 'TOOL_FAILED',
        message: error.message,
        ...passthroughFields(error),
        ...(sourceDetails ? {handleErrors: sourceDetails.map(detail => toHandleError(detail, handlesByPath))} : {})
    }
}

function passthroughFields(error) {
    return PATCH_ERROR_PASSTHROUGH.reduce(
        (fields, name) => error[name] === undefined ? fields : {...fields, [name]: error[name]},
        {}
    )
}

function toHandleError(detail, handlesByPath) {
    return {handle: resolveHandle(detail.path, handlesByPath), message: detail.message}
}

function resolveHandle(path, handlesByPath) {
    if (typeof path !== 'string') return null
    return handlesByPath.get(path) || handleFromAncestor(path, handlesByPath) || null
}

// Validation errors may reference a sub-path inside a whole-object/array
// handle (e.g. /compositeOptions/filters/0/percentile). Walk up the pointer
// until we hit a handle path so the updater always gets a handle key.
function handleFromAncestor(path, handlesByPath) {
    let cursor = path
    while (true) {
        const cut = cursor.lastIndexOf('/')
        if (cut <= 0) return null
        cursor = cursor.slice(0, cut)
        if (handlesByPath.has(cursor)) return handlesByPath.get(cursor)
    }
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
