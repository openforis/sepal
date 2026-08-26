import {recipeType} from '../recipeTypeRegistry.js'
import {diagnostic, MALFORMED_REFERENCE, UNSUPPORTED_RECIPE_TYPE} from './diagnostic.js'
import {isPlainObject} from './extract.js'

// The direct source edges a recipe declares.
//
// Generic: it finds the definition for a persisted type and packages what that definition returns. There is
// no recipe-specific knowledge here and there must never be - a type that needs different handling gets a
// different definition, not a branch. A type with no definition is reported rather than answered with an
// empty edge list, which would read as "no dependencies".

export const directSourceEdges = recipe => {
    const definition = recipeType(recipe?.type)
    if (!definition) {
        return {edges: [], diagnostics: [diagnostic({code: UNSUPPORTED_RECIPE_TYPE, path: []})]}
    }
    const {model} = recipe
    // The root is one value, so a root that cannot be read is one fact. Left to the per-field walk it becomes
    // neither: a `|| {}` default absorbs '', false and 0 into an unconfigured recipe, and a truthy non-object
    // is rediscovered by every declared field, arriving once per field wearing a role that had nothing to do
    // with it. Absent and null stay the recipe every type starts as.
    if (model !== undefined && model !== null && !isPlainObject(model)) {
        return {edges: [], diagnostics: [diagnostic({code: MALFORMED_REFERENCE, path: ['model']})]}
    }
    const results = definition.directSources(model ?? {})
    return {
        edges: results.filter(result => result.edge).map(result => result.edge),
        diagnostics: results.filter(result => result.diagnostic).map(result => result.diagnostic)
    }
}
