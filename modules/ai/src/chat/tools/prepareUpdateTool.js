// Specialist-private. Given a recipe + the formal focusPaths the editor
// intends to change, return a deterministic, path-oriented edit packet:
// baseModelHash + focusPaths + the constraint-derived dependentPaths + their
// union (writablePaths) + the current effective-model value at each writable
// path, plus the facts and rule shapes that justify the companions. No
// natural-language instruction — input is formal paths only. The recipe-domain
// knowledge of which fields are coupled lives in the recipe spec's constraints;
// this tool only shapes those into a chat work packet.

const {catchError, of} = require('rxjs')
const {getRecipeSpec, getRecipeLlmMetadata, toEffectiveModel} = require('#recipes')
const {mapData} = require('../channelEvents')
const {guiProductRequest$} = require('./guiProductRequest')
const {parsePointer, resolvePointer, PointerNotFound} = require('./jsonPointer')

function prepareUpdateTool(guiRequests) {
    return {
        name: 'prepare_update',
        description: 'Prepare a bounded edit for ONE recipe from formal focusPaths (model-relative JSON Pointers you intend to change). Returns {baseModelHash, focusPaths, dependentPaths:[path], writablePaths:[path], existingPaths:[path], missingPaths:[path], currentValues:{path->value}, dependencyFacts, validationRules}. dependentPaths = sibling fields the recipe couples to your focus; writablePaths = focus ∪ dependent. existingPaths exist in the model now; missingPaths are absent — in recipe_patch use `add` for missingPaths, `replace` for existingPaths, `remove` only for existingPaths. Plan ONE atomic recipe_patch touching only writablePaths; use baseModelHash on it.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                focusPaths: {type: 'array', items: {type: 'string'}}
            },
            required: ['recipeId', 'focusPaths'],
            additionalProperties: false
        },
        invoke$: ({recipeId, focusPaths}, context) =>
            guiProductRequest$(guiRequests, context, 'load-recipe', {recipeId}).pipe(
                mapData(recipe => buildEnvelope(recipe, focusPaths)),
                catchError(error => of({
                    ok: false,
                    error: {code: error.code || 'TOOL_FAILED', message: error.message}
                }))
            )
    }
}

function buildEnvelope(recipe, focusPaths) {
    if (!recipe?.modelHash) {
        return {ok: false, error: {code: 'MISSING_MODEL_HASH', message: 'GUI load-recipe response is missing modelHash'}}
    }
    const spec = getRecipeSpec(recipe.type)
    if (!spec?.llmMetadata) {
        return {
            ok: false,
            error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: `Recipe type ${recipe.type} has no LLM metadata`}
        }
    }
    const effectiveModel = toEffectiveModel(recipe.type, recipe.model)
    const constraints = constraintsFor(recipe.type)
    const relevantConstraints = constraintsTouching(constraints, focusPaths)
    const dependentPaths = dependentsFrom(relevantConstraints, focusPaths)
    const writablePaths = union(focusPaths, dependentPaths)
    const states = Object.fromEntries(writablePaths.map(path => [path, pathState(effectiveModel, path)]))
    return {
        ok: true,
        data: {
            baseModelHash: recipe.modelHash,
            focusPaths,
            dependentPaths,
            writablePaths,
            existingPaths: writablePaths.filter(path => states[path].exists),
            missingPaths: writablePaths.filter(path => !states[path].exists),
            currentValues: Object.fromEntries(writablePaths.map(path => [path, states[path].value])),
            dependencyFacts: dependencyFacts(relevantConstraints, dependentPaths),
            validationRules: validationRules(relevantConstraints)
        }
    }
}

function constraintsFor(recipeType) {
    return getRecipeLlmMetadata(recipeType).constraints
}

// A focus path's dependents are the OTHER paths of every constraint that
// references it. Symmetric by construction: focusing seasonStart finds the
// seasonStartWindow constraint and pulls in its targetDate. The focus paths
// themselves are excluded; companions shared across constraints are de-duped.
function dependentsFrom(constraints, focusPaths) {
    const focus = new Set(focusPaths)
    const companions = constraints.flatMap(constraint => constraint.paths.filter(path => !focus.has(path)))
    return distinct(companions)
}

function constraintsTouching(constraints, focusPaths) {
    const focus = new Set(focusPaths)
    return constraints.filter(constraint => constraint.paths.some(path => focus.has(path)))
}

function dependencyFacts(constraints, dependentPaths) {
    const dependents = new Set(dependentPaths)
    return constraints.flatMap(constraint =>
        constraint.paths
            .filter(path => dependents.has(path))
            .map(path => ({path, constraint: constraint.name, description: constraint.description}))
    )
}

function validationRules(constraints) {
    return constraints.map(({name, description}) => ({name, description}))
}

function union(focusPaths, dependentPaths) {
    return [...new Set([...focusPaths, ...dependentPaths])]
}

function distinct(paths) {
    return [...new Set(paths)]
}

// A writable path absent from the effective model is reported as missing with a
// null value rather than throwing — keeping a currentValues key for every
// writablePath while making absence explicit (a null value alone is ambiguous
// with a present null). Companions like includedCloudMasking are commonly absent
// yet still coupled; the specialist must `add` those, not `replace` them.
function pathState(effectiveModel, path) {
    try {
        return {exists: true, value: resolvePointer(effectiveModel, parsePointer(path))}
    } catch (error) {
        if (error instanceof PointerNotFound) return {exists: false, value: null}
        throw error
    }
}

module.exports = {prepareUpdateTool}
