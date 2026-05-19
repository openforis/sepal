// Projects a loaded recipe to the LLM-facing shape: model fields at the root
// plus a `baseModelHash` sibling. Identity (id/type/name/projectId) is NOT
// included — the LLM already has the recipeId from its tool args, and recipe
// type was resolved by the dispatcher's recipe-metadata preflight. Returning
// fields the LLM doesn't need would only invite confusion; in particular,
// having a `model` wrapper caused the LLM to patch /model/dates/... instead
// of /dates/... (recipe_patch operates on the model, not the load envelope).
//
// Pipeline:
//   1. toEffectiveModel — strips dormant fields per the recipe spec (silent
//      passthrough for types without a spec). See lib/js/recipes/README.md.
//   2. Path resolution against the effective model. Missing paths return
//      value: undefined so the LLM sees a clean absent signal.
//   3. CLASSIFICATION reference-data omission on the result.

const {parsePointer, resolvePointer, formatPointer, PointerNotFound} = require('./jsonPointer')
const {toEffectiveModel} = require('#recipes')

function projectLoadedRecipe(recipe, pathString) {
    // modelHash is the optimistic-concurrency token a later recipe_patch needs;
    // without it the result is unusable, so fail fast rather than succeed.
    if (!recipe.modelHash) {
        throw new Error('recipe_load: GUI load-recipe response is missing modelHash')
    }
    const effectiveModel = toEffectiveModel(recipe.type, recipe.model)
    if (pathString === undefined) {
        return {baseModelHash: recipe.modelHash, ...projectModelValue(effectiveModel, [], recipe.type)}
    }
    const tokens = parsePointer(pathString)
    const fragment = resolveOrUndefined(effectiveModel, tokens)
    if (fragment === undefined) {
        return {baseModelHash: recipe.modelHash, value: undefined}
    }
    return {baseModelHash: recipe.modelHash, value: projectModelValue(fragment, tokens, recipe.type)}
}

function resolveOrUndefined(document, tokens) {
    try {
        return resolvePointer(document, tokens)
    } catch (error) {
        if (error instanceof PointerNotFound) return undefined
        throw error
    }
}

function projectModelValue(value, tokens, type) {
    if (type !== 'CLASSIFICATION') return value
    return omitReferenceData(value, tokens)
}

function omitReferenceData(node, path) {
    if (isReferenceDataPath(path)) {
        return Array.isArray(node)
            ? {_omitted: node.length, _kind: 'referenceData', _path: formatPointer(path)}
            : node
    }
    if (Array.isArray(node)) {
        return node.map((item, index) => omitReferenceData(item, [...path, String(index)]))
    }
    if (isPlainObject(node)) {
        return Object.fromEntries(
            Object.entries(node).map(([key, child]) => [key, omitReferenceData(child, [...path, key])])
        )
    }
    return node
}

// model.trainingData.dataSets[<index>].referenceData — the only heavy field
// projected away for now. Kept deliberately explicit, not a generic rule engine.
function isReferenceDataPath(tokens) {
    return tokens.length === 4
        && tokens[0] === 'trainingData'
        && tokens[1] === 'dataSets'
        && /^\d+$/.test(tokens[2])
        && tokens[3] === 'referenceData'
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

module.exports = {projectLoadedRecipe}
