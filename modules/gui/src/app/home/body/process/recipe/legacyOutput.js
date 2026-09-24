import _ from 'lodash'

import {getRecipeType} from '../recipeTypeRegistry'

// The one module that answers from registered band helpers: what a recipe type without a declared output says it
// provides, and what a map product not yet declared shows. Only the read (recipeOutput.js) consults it, so a type
// that declares its output leaves this seam by removing its entry, and nothing that reads bands changes.
//
// A helper's answer passes through unchanged - band names and the display hints beside them - and is never
// physical evidence. Its `dataType` is display precision, except where a helper answering from observed evidence
// states dimensionality; which is which is the read's to separate.

export const IMAGE_OUTPUT = 'IMAGE_OUTPUT'

// A table of band name to helper entry; null when the evidence the helper answers from could not be had, which is
// never an empty answer; undefined when the type has no such product.
export const legacyBands = (recipe, product) => {
    const {mapProducts, getAvailableBands} = getRecipeType(recipe.type) || {}
    if (mapProducts) {
        return mapProducts.bands(recipe, product)
    }
    return product.name === IMAGE_OUTPUT && getAvailableBands
        ? getAvailableBands(recipe)
        : undefined
}

// The layer config a layer's product is read from: its type's defaults beneath what the layer saved. The product
// that is described, previewed and edited is decided from this one config, so it never depends on whether the
// layer form has yet written its defaults.
export const effectiveLayerConfig = (recipe, layerConfig) => ({
    ...getRecipeType(recipe.type)?.mapProducts?.defaults,
    ...layerConfig
})

// Which product a layer shows. A type without map products shows its output, whatever its layer config says;
// a type with them names the product from its own vocabulary, and a value it does not know is no product at all.
export const layerProduct = (recipe, layerConfig) => {
    const {mapProducts} = getRecipeType(recipe.type) || {}
    return mapProducts
        ? mapProducts.productOf(effectiveLayerConfig(recipe, layerConfig))
        : {name: IMAGE_OUTPUT}
}

// What every request about a layer's image carries to name the product it shows - on the wire, the effective layer
// config itself, as the preview has always sent it. Preview, band choices, histogram and distinct values are built
// from the same arguments, so they concern one product.
export const productArgs = (recipe, layerConfig) =>
    _.omit(effectiveLayerConfig(recipe, layerConfig), ['visParams'])

// The band answer Task submission filters exported visualizations against, exactly as before the read existed.
// Transitional: Retrieve's own migration replaces it.
export const submissionBands = recipe => {
    const {legacySubmissionBands, getAvailableBands} = getRecipeType(recipe.type) || {}
    return (legacySubmissionBands || getAvailableBands)?.(recipe) || {}
}
