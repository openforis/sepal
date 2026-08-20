import {recipeType} from '../recipeTypeRegistry.js'
import {diagnostic, UNSUPPORTED_RECIPE_TYPE} from './diagnostic.js'

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
    const results = definition.directSources(recipe.model || {})
    return {
        edges: results.filter(result => result.edge).map(result => result.edge),
        diagnostics: results.filter(result => result.diagnostic).map(result => result.diagnostic)
    }
}
