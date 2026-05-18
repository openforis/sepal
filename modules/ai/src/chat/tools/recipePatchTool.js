// Specialist-private: never on the orchestrator surface. The GUI bridge owns
// concurrency (baseModelHash), atomic JSON Patch application, and post-apply
// effective-model validation via the shared recipe spec. This tool just hands
// the envelope across and maps GUI-side error codes through to the tool result.

const {catchError, map, of} = require('rxjs')
const {guiProductRequest$} = require('./guiProductRequest')

const PATCH_ERROR_FIELDS = ['currentModelHash', 'errors', 'details']

function recipePatchTool(guiRequests) {
    return {
        name: 'recipe_patch',
        description: 'Apply JSON Patch (RFC 6902) to ONE recipe. operations on effective model; atomic. Requires baseModelHash from prior recipe_load -> mismatch returns STALE_WRITE {currentModelHash} -> reload + retry. VALIDATION_FAILED returns {errors:[{path,message,rule}]}. INVALID_PATCH / PATCH_APPLY_FAILED for envelope or apply failure. ok -> {summary, modelHash, invalidatedPaths}; modelHash is next call\'s baseModelHash.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                baseModelHash: {type: 'string'},
                operations: {type: 'array', minItems: 1, items: {type: 'object'}}
            },
            required: ['recipeId', 'baseModelHash', 'operations'],
            additionalProperties: false
        },
        invoke$: (input, context) =>
            guiProductRequest$(guiRequests, context, 'recipe-patch', input).pipe(
                map(data => ({ok: true, data})),
                catchError(error => of({ok: false, error: toErrorEnvelope(error)}))
            )
    }
}

function toErrorEnvelope(error) {
    const envelope = {code: error.code || 'TOOL_FAILED', message: error.message}
    for (const field of PATCH_ERROR_FIELDS) {
        if (error[field] !== undefined) envelope[field] = error[field]
    }
    return envelope
}

module.exports = {recipePatchTool}
