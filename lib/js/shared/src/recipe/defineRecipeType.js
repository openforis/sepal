// A shared recipe-type definition.
//
// One per persisted recipe type, describing that type - not constructing a recipe instance. The definition
// owns everything type-specific: which of its persisted model fields hold sources, how its legacy shapes
// and bare ids normalize, the role identifiers it declares, and the extraction itself. Generic code holds
// the definitions and reads them; it never branches on a recipe type.
//
// Both fields are required, so a type that genuinely has no dependencies says so with
// `directSources: () => []`. Omitting it is a definition mistake, not a recipe with no sources, and failing
// here is what keeps that from being answered as an empty dependency list at runtime.
//
// The optional image output is where a type states how it produces its IMAGE_OUTPUT. Optional, because most
// types have not been migrated and not declaring one must stay distinguishable from declaring one - so an
// undeclared type keeps no key at all rather than an empty one. Its structure is checked by the transformation
// module that owns those rules, never re-stated here.
//
// The validation is exported separately because nothing in JavaScript makes a module call
// defineRecipeType(): the registry re-checks what it imports, so a definition that skipped this or lost a
// field in an edit fails at load with a stated reason rather than as a TypeError inside a caller.

import {validateImageOutputTransformation} from './output/transformation.js'

export const validateRecipeType = definition => {
    const {type, directSources, imageOutput} = definition || {}
    if (typeof type !== 'string' || type.trim().length === 0) {
        throw new Error(`A recipe type definition requires a non-blank persisted type, got: ${JSON.stringify(type)}`)
    }
    if (typeof directSources !== 'function') {
        throw new Error(`Recipe type ${type} must declare directSources; a type with no dependencies declares "directSources: () => []"`)
    }
    if (imageOutput !== undefined) {
        validateImageOutputTransformation(imageOutput)
    }
    return definition
}

export const defineRecipeType = definition => {
    const {type, directSources, imageOutput} = validateRecipeType(definition)
    return Object.freeze(imageOutput === undefined
        ? {type, directSources}
        : {type, directSources, imageOutput})
}
