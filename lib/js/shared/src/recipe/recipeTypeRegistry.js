import {validateRecipeType} from './defineRecipeType.js'
import assetMosaic from './type/assetMosaic.js'
import ccdc from './type/ccdc.js'
import ccdcSlice from './type/ccdcSlice.js'
import classification from './type/classification.js'

// The recipe types that have a shared definition.
//
// Indexing and lookup only. It holds definitions that declare themselves and answers which one describes a
// persisted type; it must never learn what a source is, what a role means, or anything else specific to a
// recipe. Definitions are imported explicitly rather than discovered on a filesystem, so what is defined is
// visible here and identical in every runtime that bundles this library.
//
// A Map, so a persisted type string can never reach an inherited member, and so a duplicate is a load-time
// error rather than one definition silently replacing another. Every imported definition is re-validated
// against the same contract defineRecipeType() enforces, because being imported here is what makes a
// definition reachable - not having been built correctly.

export const createRecipeTypeRegistry = definitions => {
    const byType = new Map()
    definitions.forEach(definition => {
        validateRecipeType(definition)
        if (byType.has(definition.type)) {
            throw new Error(`Duplicate recipe type definition: ${definition.type}`)
        }
        byType.set(definition.type, definition)
    })
    return byType
}

const REGISTRY = createRecipeTypeRegistry([
    assetMosaic,
    ccdc,
    ccdcSlice,
    classification
])

export const recipeType = type =>
    REGISTRY.get(type)

export const isSupportedRecipeType = type =>
    REGISTRY.has(type)
