import {sourceEvidenceOr} from '../sourceEvidence'

// The bands Masking outputs are the primary image's, because applying a mask changes which pixels are valid
// and nothing about the schema. Current evidence answers that whenever it exists; the band names copied into
// the model when the source was selected are only what remains when it does not.
//
// What a snapshot is good enough for is DRAWING: a layer rendered inside another recipe's map has nothing
// observing, and showing it as it was last seen is better than showing nothing. Retrieve does not read this -
// it owns a resolution of its own, and exports what that resolution describes.
//
// Dimensionality and encoding ride along, because deciding what may be drawn needs the first. Neither removes a
// band: an array band stays here, and stays exportable, whatever a renderer can do with it.
export const getAvailableBands = recipe => {
    const {bands} = sourceEvidenceOr(recipe, recipe.model?.imageToMask)
    const availableBands = {}
    bands.forEach(({name, dataType, encoding}) => availableBands[name] = {
        ...(dataType && {dataType}),
        ...(encoding && {encoding})
    })
    return availableBands
}
