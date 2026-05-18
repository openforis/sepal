// Projects a loaded recipe to the LLM-facing shape:
//   1. toEffectiveModel — strips dormant fields per the recipe spec (silent
//      passthrough for types without a spec). See lib/js/shared/src/recipe/README.md.
//   2. Path resolution against the effective model. Missing paths return
//      value: undefined so the LLM sees a clean absent signal.
//   3. CLASSIFICATION reference-data omission on the result.

const {parsePointer, resolvePointer, formatPointer, PointerNotFound} = require('./jsonPointer')
const {toEffectiveModel} = require('#sepal/recipe')

function projectLoadedRecipe(recipe, pathString) {
    // modelHash is the optimistic-concurrency token a later recipe_patch needs;
    // without it the result is unusable, so fail fast rather than succeed.
    if (!recipe.modelHash) {
        throw new Error('recipe_load: GUI load-recipe response is missing modelHash')
    }
    const identity = recipeIdentity(recipe)
    const effectiveModel = toEffectiveModel(recipe.type, recipe.model)
    if (pathString === undefined) {
        return {...identity, model: projectModelValue(effectiveModel, [], recipe.type)}
    }
    const tokens = parsePointer(pathString)
    const fragment = resolveOrUndefined(effectiveModel, tokens)
    if (fragment === undefined) {
        return {...identity, value: undefined}
    }
    return {...identity, value: projectModelValue(fragment, tokens, recipe.type)}
}

function resolveOrUndefined(document, tokens) {
    try {
        return resolvePointer(document, tokens)
    } catch (error) {
        if (error instanceof PointerNotFound) return undefined
        throw error
    }
}

function recipeIdentity(recipe) {
    const identity = {id: recipe.id, type: recipe.type, name: recipe.name ?? recipe.title}
    if (recipe.projectId !== undefined) identity.projectId = recipe.projectId
    identity.modelHash = recipe.modelHash
    return identity
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
