// Specialist-private. Deterministic handle-keyed recipe create: maps short
// semantic handles to internal recipe paths, applies the requested values to
// `spec.defaultModel()`, validates the projected effective model, and hands
// the result to the GUI create-recipe bridge. Rejects values outside the
// prepared writableHandles scope before any GUI work. Errors come back to the
// updater in handle terms; internal paths stay below the GUI/log boundary and
// never reach the model-facing envelope.

import {catchError, of} from 'rxjs'

import {getRecipeHandles, getRecipeSpec, toEffectiveModel} from '#recipes'

import {mapData} from '../../channelEvents.js'
import {guiProductRequest$} from '../../tools/guiProductRequest.js'
import {
    applyHandleValuesToModel, checkApplicability, checkInactiveValues,
    checkUnknownHandles, checkWritableScope,
    invertByPath, mapErrorDetailsToHandles, toHandleError
} from '../handleValueIO.js'

function createRecipeValuesTool(guiRequests) {
    return {
        name: 'create_recipe_values',
        description: 'Create ONE new recipe by setting values for the writable handle set. Send {values:{handle->value}}. The workflow supplies the recipe type, project, name, and writable handle set. The tool applies values to defaults, validates the projected model, and calls the GUI create. Returns recipe identity on success or a handle-keyed error.',
        parameters: {
            type: 'object',
            properties: {
                recipeType: {type: 'string'},
                projectId: {type: 'string'},
                name: {type: 'string'},
                writableHandles: {
                    type: 'array',
                    items: {type: 'string'},
                    description: 'The allowed write scope for this attempt, carried verbatim from the prepared packet.'
                },
                values: {
                    type: 'object',
                    description: 'Handle-keyed values to set on the default model. Whole-array handles take the whole intended array; whole-object handles take the whole intended object.',
                    additionalProperties: true
                }
            },
            required: ['recipeType', 'writableHandles', 'values'],
            additionalProperties: false
        },
        invoke$: (input, context) => handleRequest$({guiRequests, context, ...input})
    }
}

function handleRequest$({guiRequests, context, recipeType, projectId, name, writableHandles, values}) {
    const spec = getRecipeSpec(recipeType)
    const handles = getRecipeHandles(recipeType)
    if (!spec || !handles) return of(unsupportedRecipeType(recipeType))
    const handlesByName = new Map(handles.map(handle => [handle.name, handle]))

    const scopeError = checkWritableScope(values, writableHandles)
    if (scopeError) return of(scopeError)
    const unknownError = checkUnknownHandles(values, handlesByName, recipeType)
    if (unknownError) return of(unknownError)

    const model = applyHandleValuesToModel(spec.defaultModel(), values, handlesByName)
    const effectiveModel = toEffectiveModel(recipeType, model)

    const applicabilityError = checkApplicability({values, effectiveModel, handlesByName})
    if (applicabilityError) return of(applicabilityError)
    // Projection-survival guard: any requested value that gets stripped by
    // toEffectiveModel (e.g. a selector companion whose item isn't enabled)
    // is rejected with a handle-keyed error before any GUI work.
    const inactiveError = checkInactiveValues({values, projectedModel: effectiveModel, handlesByName})
    if (inactiveError) return of(inactiveError)

    const handlesByPath = invertByPath(handlesByName)
    const validationErrors = spec.validate(effectiveModel)
    if (validationErrors.length) return of(validationFailureEnvelope(validationErrors, handlesByPath))

    return guiProductRequest$(guiRequests, context, 'create-recipe', buildCreateParams({recipeType, projectId, name, effectiveModel})).pipe(
        mapData(data => successEnvelope({data, recipeType, projectId, name})),
        catchError(error => of({ok: false, error: toErrorEnvelope(error, handlesByPath)}))
    )
}

// The GUI's create-recipe handler re-projects + re-validates the model — by
// passing the already-effective model here, both sides see the same shape and
// dormant fields cannot validate-then-leak through the AI path.
function buildCreateParams({recipeType, projectId, name, effectiveModel}) {
    return {
        type: recipeType,
        ...(projectId !== undefined ? {projectId} : {}),
        ...(name !== undefined ? {name} : {}),
        model: effectiveModel
    }
}

function unsupportedRecipeType(recipeType) {
    return {
        ok: false,
        error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: `Recipe type ${recipeType} has no handle catalog`}
    }
}

function validationFailureEnvelope(validationErrors, handlesByPath) {
    return {
        ok: false,
        error: {
            code: 'VALIDATION_FAILED',
            message: `${validationErrors.length} validation error${validationErrors.length === 1 ? '' : 's'}`,
            handleErrors: validationErrors.map(error => toHandleError(error, handlesByPath))
        }
    }
}

function successEnvelope({data, recipeType, projectId, name}) {
    return {
        ok: true,
        data: {
            recipeId: data?.recipeId || data?.id || null,
            type: data?.type || recipeType,
            name: data?.name !== undefined ? data.name : name,
            projectId: data?.projectId !== undefined ? data.projectId : projectId,
            summary: data?.summary || ''
        }
    }
}

function toErrorEnvelope(error, handlesByPath) {
    const handleErrors = mapErrorDetailsToHandles(error, handlesByPath)
    return {
        code: error.code || 'TOOL_FAILED',
        message: error.message,
        ...(handleErrors ? {handleErrors} : {})
    }
}

export {createRecipeValuesTool}
