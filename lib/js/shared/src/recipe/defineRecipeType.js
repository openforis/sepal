// A shared recipe-type definition.
//
// One per persisted recipe type, describing that type - not constructing a recipe instance. The definition
// owns everything type-specific: which of its persisted model fields hold sources, how its legacy shapes
// and bare ids normalize, the role identifiers it declares, and the extraction itself. Generic code holds
// the definitions and reads them; it never branches on a recipe type.
//
// Its sources are required, so a type that genuinely has no dependencies says so with
// `directSources: () => []`. Omitting it is a definition mistake, not a recipe with no sources, and failing
// here is what keeps that from being answered as an empty dependency list at runtime.
//
// `segmentSource`, `historicalStatsSource` and `opticalCollectionDefaults` are the optional declarations a
// producer makes about what it produces. A reader asks the producer rather than recognising producer types;
// each capability owns what its own declaration means.
//
// The optional map products are the other images its map layers can show (output/product.js).
//
// The optional `displaySources` are references its editor reads and shows, but execution does not: they are shown as map
// layers and never resolved as dependencies, evidence or execution inputs (source/directSources.js reads only
// `directSources`). Same results as `directSources`; a type without any omits it.
//
// The image output is required too: the type's IMAGE_OUTPUT provider, or NO_IMAGE_OUTPUT for a type whose recipes
// produce no image. A type that states neither is a definition mistake, refused here rather than answered at runtime as
// an output nobody declared. Its structure is checked by the provider module that owns those rules, never re-stated
// here.
//
// What running its image needs is declared beside it (output/readiness.js): `executionNeeds` for IMAGE_OUTPUT, required
// of a type with an image, and the optional `configurationRequirements` its own model must meet.

// The validation is exported separately because nothing in JavaScript makes a module call
// defineRecipeType(): the registry re-checks what it imports, so a definition that skipped this or lost a
// field in an edit fails at load with a stated reason rather than as a TypeError inside a caller.

import {validateMapProducts} from './output/product.js'
import {NO_IMAGE_OUTPUT, validateImageOutputProvider} from './output/provider.js'
import {IMAGE_OUTPUT, validateReadinessDeclarations} from './output/readiness.js'

export const validateRecipeType = definition => {
    const {type, directSources, imageOutput, mapProducts} = definition || {}
    if (typeof type !== 'string' || type.trim().length === 0) {
        throw new Error(`A recipe type definition requires a non-blank persisted type, got: ${JSON.stringify(type)}`)
    }
    if (typeof directSources !== 'function') {
        throw new Error(`Recipe type ${type} must declare directSources; a type with no dependencies declares "directSources: () => []"`)
    }
    if (imageOutput === undefined) {
        throw new Error(`Recipe type ${type} must declare its imageOutput; a type producing no image declares "imageOutput: NO_IMAGE_OUTPUT"`)
    }
    if (imageOutput !== NO_IMAGE_OUTPUT) {
        validateImageOutputProvider(imageOutput)
        if (!definition.executionNeeds?.[IMAGE_OUTPUT]) {
            throw new Error(`Recipe type ${type} must declare what running its image needs of each role: executionNeeds.${IMAGE_OUTPUT}`)
        }
    }
    validateReadinessDeclarations(type, definition)
    if (mapProducts !== undefined) {
        validateMapProducts(type, mapProducts)
    }
    if (definition.displaySources !== undefined && typeof definition.displaySources !== 'function') {
        throw new Error(`Recipe type ${type} declares displaySources that is not a function`)
    }
    return definition
}

export const defineRecipeType = definition => {
    const {
        type, directSources, displaySources, imageOutput, mapProducts, segmentSource, historicalStatsSource,
        opticalCollectionDefaults, configurationRequirements, executionNeeds
    } = validateRecipeType(definition)
    return Object.freeze({
        type,
        directSources,
        imageOutput,
        ...(displaySources === undefined ? {} : {displaySources}),
        ...(configurationRequirements === undefined ? {} : {configurationRequirements}),
        ...(executionNeeds === undefined ? {} : {executionNeeds}),
        ...(mapProducts === undefined ? {} : {mapProducts}),
        ...(segmentSource === undefined ? {} : {segmentSource}),
        ...(historicalStatsSource === undefined ? {} : {historicalStatsSource}),
        ...(opticalCollectionDefaults === undefined ? {} : {opticalCollectionDefaults})
    })
}
