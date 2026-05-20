// Specialist-private: never on the orchestrator surface. The GUI bridge owns
// concurrency (baseModelHash), atomic JSON Patch application, and post-apply
// effective-model validation via the shared recipe spec. This tool just hands
// the envelope across and maps GUI-side error codes through to the tool result.

const {catchError, of} = require('rxjs')
const {guiProductRequest$} = require('./guiProductRequest')
const {mapData} = require('../channelEvents')

const PATCH_ERROR_FIELDS = ['currentModelHash', 'errors', 'details']

function recipePatchTool(guiRequests) {
    return {
        name: 'recipe_patch',
        description: 'Apply JSON Patch (RFC 6902) to ONE recipe. Put every related field edit in one operations array; operations are applied atomically, in order, to the effective model. Requires baseModelHash from prior prepare_update -> mismatch returns STALE_WRITE {currentModelHash} -> re-run prepare_update + retry. VALIDATION_FAILED returns {errors:[{path,message,rule}]}. INVALID_PATCH / PATCH_APPLY_FAILED for envelope or apply failure. ok -> {summary, modelHash, invalidatedPaths}; modelHash is next call\'s baseModelHash.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string', description: 'The one recipe being patched.'},
                baseModelHash: {type: 'string', description: 'baseModelHash returned by the preceding prepare_update.'},
                operations: {
                    type: 'array',
                    minItems: 1,
                    description: 'One or more RFC 6902 operations. Group related changes here, e.g. targetDate plus seasonStart plus seasonEnd in the same array.',
                    items: {
                        type: 'object',
                        description: 'A single RFC 6902 operation. Paths are model-relative JSON Pointers such as /dates/targetDate.',
                        properties: {
                            op: {type: 'string', enum: ['add', 'remove', 'replace', 'move', 'copy', 'test']},
                            path: {type: 'string', description: 'Model-relative JSON Pointer path.'},
                            value: {description: 'Value for add, replace, and test operations.'},
                            from: {type: 'string', description: 'Source JSON Pointer for move and copy operations.'}
                        },
                        required: ['op', 'path'],
                        additionalProperties: false
                    }
                }
            },
            required: ['recipeId', 'baseModelHash', 'operations'],
            additionalProperties: false
        },
        invoke$: (input, context) =>
            guiProductRequest$(guiRequests, context, 'recipe-patch', input).pipe(
                mapData(data => ({ok: true, data})),
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
