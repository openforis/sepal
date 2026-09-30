import _ from 'lodash'

import {IMAGE_OUTPUT} from '#sepal/recipe/output/product'

import {getRecipeType} from '../recipeTypeRegistry'

// Which product a map layer shows, named from its layer config in the vocabulary its type's map products register, and
// the arguments every request about the layer's image carries to name it.

export {IMAGE_OUTPUT}

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
