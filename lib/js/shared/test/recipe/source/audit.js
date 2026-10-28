import {isSupportedRecipeType} from '#sepal/recipe/recipeTypeRegistry'
import {diagnostic, UNSUPPORTED_RECIPE_TYPE} from '#sepal/recipe/source/diagnostic'
import {directSourceEdges} from '#sepal/recipe/source/directSources'
import {isCanonicalReferenceShaped} from '#sepal/recipe/source/reference'

import {nonEdgeFields} from './nonEdges.js'

// Completeness guard for recipe types that have a shared definition.
//
// This is a migration aid, not a resolver, and it is test-only for that reason: nothing under src imports
// it. Walking a recipe model looking for reference-shaped objects can only ever be a cross-check. It is
// what catches a reference added to a defined model in a later packet without being declared, so that it
// fails loudly here instead of quietly disappearing from the dependency graph. Nothing may resolve
// dependencies this way - only a recipe-type definition knows what a reference in its model means.
//
// Two limits are inherent and must not be mistaken for coverage:
//
//   False negatives. References stored as bare id strings - a CCDC classification, a Planet asset, an
//   ASSET_MOSAIC asset id, a recipe-backed training data set - are indistinguishable from any other string.
//   The scan cannot see them at all; they are covered by their definitions and by the fixture tests.
//
//   False positives. `type` is a crowded word in these models. A Classification training data set of type
//   EE_TABLE looks exactly like the country-table AOI reference but is a record of points already read into
//   the model. Such collisions are listed as classified non-edges with their reason, which is the only
//   honest way to keep the guard strict for everything else.

// The audit's own recognition vocabulary: the canonical shapes, plus the legacy AOI shapes that mean the
// same thing. modules/gui/src/app/home/body/process/recipe/mosaic/panels/aoi/aoiModel.js persists a
// recipe-backed AOI as 'RECIPE' and the country and custom-table AOIs as 'EE_TABLE'.
//
// Kept here rather than imported from the AOI module, so that a test-only guard cannot shape the production
// API. The cost is that this list is maintained by hand: an AOI shape added there and not added here would
// go unrecognized at an undeclared path.
const LEGACY_REFERENCE_TYPES = ['RECIPE', 'EE_TABLE']

const isLegacyReferenceShaped = value =>
    !!value && typeof value === 'object' && !Array.isArray(value)
        && LEGACY_REFERENCE_TYPES.includes(value.type)

const isReferenceShaped = value =>
    isCanonicalReferenceShaped(value) || isLegacyReferenceShaped(value)

// Produced only here: an undeclared reference is a migration failure, not a runtime diagnosis.
export const UNDECLARED_REFERENCE = 'UNDECLARED_REFERENCE'

const samePath = (a, b) =>
    a.length === b.length && a.every((key, index) => key === b[index])

// '*' matches one array index or key. A pattern matches a prefix of the path, which is how a whole subtree
// of copied evidence is classified in one line. An exact pattern matches only the value at that path, and
// nothing nested under it.
const matchesPattern = ({path: pattern, exact}, path) =>
    (exact ? pattern.length === path.length : pattern.length <= path.length)
        && pattern.every((key, index) => key === '*' || key === path[index])

const isExactlyClassified = (classified, path) =>
    classified.some(nonEdge => nonEdge.exact && matchesPattern(nonEdge, path))

// A reference is terminal. Whatever a source snapshot copied off its source belongs to that one reference,
// and sourceSync spreads the asset's own properties into it, so descending would report a provenance
// property as a second dependency.
//
// A record excused by an exact classification is the opposite case: it is not a reference at all, it only
// collides with the vocabulary on `type`, so the walk continues through it. Excusing the record for its own
// shape must not excuse everything nested under it.
const scanReferencePaths = ({value, path, classified, found}) => {
    if (isReferenceShaped(value) && !isExactlyClassified(classified, path)) {
        found.push(path)
    } else if (Array.isArray(value)) {
        value.forEach((entry, index) =>
            scanReferencePaths({value: entry, path: [...path, index], classified, found}))
    } else if (value && typeof value === 'object') {
        Object.keys(value).forEach(key =>
            scanReferencePaths({value: value[key], path: [...path, key], classified, found}))
    }
    return found
}

export const auditDirectSources = recipe => {
    if (!isSupportedRecipeType(recipe?.type)) {
        return {diagnostics: [diagnostic({code: UNSUPPORTED_RECIPE_TYPE, path: []})]}
    }
    const {edges, diagnostics} = directSourceEdges(recipe)
    // A reference the definition already reported as incomplete or malformed is accounted for; reporting it
    // again as undeclared would bury the real diagnosis. Those diagnoses are carried through rather than
    // consumed: a declared source that lost its id must not audit clean.
    const declaredPaths = [...edges, ...diagnostics].map(({path}) => path)
    const classified = nonEdgeFields(recipe.type)
    const undeclared = scanReferencePaths({value: recipe.model || {}, path: ['model'], classified, found: []})
        .filter(path => !declaredPaths.some(declaredPath => samePath(declaredPath, path)))
        .filter(path => !classified.some(nonEdge => matchesPattern(nonEdge, path)))
    return {
        diagnostics: [
            ...diagnostics,
            ...undeclared.map(path => diagnostic({code: UNDECLARED_REFERENCE, path}))
        ]
    }
}
