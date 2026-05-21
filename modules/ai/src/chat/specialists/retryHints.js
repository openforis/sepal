// Derives conservative, recipe-agnostic retry hints from a failed recipe_patch
// error envelope, so the specialist can recover without re-deriving strategy
// from raw error strings. Hints are advisory only — recipe_patch stays strict
// and nothing is auto-corrected. Raw error fields are preserved alongside.

function retryHintsFromError(error, operations) {
    if (!error) return [unknownHint('')]
    switch (error.code) {
        case 'STALE_WRITE': return [staleWriteHint(error)]
        case 'VALIDATION_FAILED': return validationHints(error)
        case 'INVALID_PATCH': return [invalidPatchHint(error)]
        case 'PATCH_APPLY_FAILED': return [applyFailedHint(error, operations)]
        default: return [unknownHint(error.message)]
    }
}

function staleWriteHint(error) {
    return {
        kind: 'stale-write',
        message: error.message,
        suggestedAction: 'Re-run prepare_update for a fresh baseModelHash, replan, retry once.'
    }
}

function validationHints(error) {
    const details = error.details || error.errors || []
    if (!details.length) return [unknownHint(error.message)]
    return details.map(detail => ({
        kind: 'validation-dependency',
        path: detail.path,
        message: detail.rule ? `${detail.message} (${detail.rule})` : detail.message,
        suggestedAction: 'Patch the coupled field(s) in the SAME atomic recipe_patch, using writablePaths from prepare_update.'
    }))
}

function invalidPatchHint(error) {
    return {
        kind: 'unknown',
        message: error.message,
        suggestedAction: 'Fix the patch envelope/op shape; keep the same recipe intent.'
    }
}

function applyFailedHint(error, operations) {
    const message = error.message || ''
    const path = pointerFor(message, operations)
    if (/required/i.test(message)) {
        return withPath({kind: 'required-field', message, suggestedAction: 'Required field — replace it with a valid value; never remove it.'}, path)
    }
    if (/invalid array index|array index/i.test(message)) {
        return withPath({kind: 'invalid-array-index', message, suggestedAction: 'Array paths are index-based. For a short config array, replace the WHOLE array (see currentValues/pathHints), not an indexed or value-name path.'}, path)
    }
    if (/already exists/i.test(message)) {
        return withPath({kind: 'existing-path', message, suggestedAction: 'Path exists — use replace, not add (see existingPaths).'}, path)
    }
    if (/not found|does not exist|no such/i.test(message)) {
        return withPath({kind: 'missing-path', message, suggestedAction: 'Path is absent — use add, not replace/remove (see missingPaths). To drop an array member, replace the whole config array instead.'}, path)
    }
    return withPath({kind: 'unknown', message, suggestedAction: 'Re-check writablePaths, existingPaths/missingPaths, and pathHints from prepare_update before retrying.'}, path)
}

function unknownHint(message) {
    return {
        kind: 'unknown',
        message: message || '',
        suggestedAction: 'Re-check the prepare_update packet (writablePaths, existingPaths/missingPaths, pathHints) before retrying.'
    }
}

function withPath(hint, path) {
    return path ? {...hint, path} : hint
}

// Prefer a JSON Pointer named in the error message; otherwise the single
// attempted op's path. Avoid guessing a path when multiple ops were attempted.
function pointerFor(message, operations) {
    const match = message.match(/\/[^\s,'"]+/)
    if (match) return match[0]
    if (operations?.length === 1) return operations[0].path
    return null
}

module.exports = {retryHintsFromError}
