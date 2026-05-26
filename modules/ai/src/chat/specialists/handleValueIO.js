// Shared handle-keyed value I/O helpers — the boundary between the LLM-facing
// handle vocabulary and the recipe spec's internal JSON Pointer paths. Used by
// every recipe-values tool (currently update_recipe_values and
// create_recipe_values). Domain concept: writable scope + applicability +
// path<->handle error translation. Each tool layers its own envelope shape
// over these primitives (success summary, optional passthrough fields, etc.).

const {applicabilityConflictFor, isSelectorHandle, scopeIndexFromHandles, scopeValueIn} = require('./applicability')

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

function checkUnknownHandles(values, handlesByName, recipeType) {
    const unknown = Object.keys(values || {}).filter(handle => !handlesByName.has(handle))
    if (!unknown.length) return null
    return {
        ok: false,
        error: {
            code: 'UNKNOWN_HANDLE',
            message: `Unknown handle(s) for ${recipeType}: ${unknown.join(', ')}`,
            handles: unknown
        }
    }
}

// In-process rejection for selector items whose appliesTo is not satisfied by
// the post-write scope handle. Values overlay the model so a single write that
// fixes both the selector and its prerequisite together is fine; only a write
// that requests an item the post-write scope still doesn't support fails.
// Without this, toEffectiveModel would silently strip the inapplicable item
// during projection and the inner write would succeed against a model that
// quietly dropped the user's intent; this surfaces the conflict in handle
// terms before any IO.
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

function invertByPath(handlesByName) {
    return new Map([...handlesByName.values()].map(handle => [handle.path, handle.name]))
}

// Maps validation/persistence error details (path-keyed) back to handle names.
// Returns null when the error carries no array-of-details surface, so callers
// can short-circuit (no handleErrors field). Path-to-handle resolution walks
// ancestors — a sub-path inside a whole-object/array handle still resolves to
// the handle key.
function mapErrorDetailsToHandles(error, handlesByPath) {
    const sourceDetails = Array.isArray(error.errors) ? error.errors
        : Array.isArray(error.details) ? error.details
        : null
    if (!sourceDetails) return null
    return sourceDetails.map(detail => toHandleError(detail, handlesByPath))
}

function toHandleError(detail, handlesByPath) {
    return {handle: resolveDetailHandle(detail, handlesByPath), message: detail.message}
}

// AJV reports `required` violations with instancePath at the container and the
// offending field name in params.missingProperty; validate.js carries that
// across as detail.missingProperty. Compose them so a missing top-level field
// like /aoi resolves to its handle instead of falling through to null.
function resolveDetailHandle(detail, handlesByPath) {
    if (typeof detail.missingProperty === 'string' && detail.missingProperty) {
        const composed = `${detail.path || ''}/${detail.missingProperty}`
        const handle = resolveHandle(composed, handlesByPath)
        if (handle) return handle
    }
    return resolveHandle(detail.path, handlesByPath)
}

function resolveHandle(path, handlesByPath) {
    if (typeof path !== 'string' || !path) return null
    return handlesByPath.get(path) || handleFromAncestor(path, handlesByPath) || null
}

function handleFromAncestor(path, handlesByPath) {
    let cursor = path
    while (true) {
        const cut = cursor.lastIndexOf('/')
        if (cut <= 0) return null
        cursor = cursor.slice(0, cut)
        if (handlesByPath.has(cursor)) return handlesByPath.get(cursor)
    }
}

module.exports = {
    checkWritableScope,
    checkUnknownHandles,
    checkApplicability,
    invertByPath,
    mapErrorDetailsToHandles,
    resolveHandle,
    toHandleError
}
