import {sourceEvidenceOr, UNAVAILABLE} from '../sourceEvidence'

// Masking's legacy answer: read where its source declares no output, and what task submission filters exported
// styles against. Where the source declares its output, Masking's own declaration answers instead
// (recipeOutput.js), and Retrieve owns a resolution of its own.
//
// The bands Masking outputs are the primary image's, because applying a mask changes which pixels are valid
// and nothing about the schema. Current evidence answers that whenever it exists; the band names copied into
// the model when the source was selected are only what remains when nothing has been observed - as for a layer
// rendered inside another recipe's map, which shows it as it was last seen rather than nothing.
//
// Dimensionality and encoding ride along, because deciding what may be drawn needs the first. Neither removes a
// band: an array band stays here, and stays exportable, whatever a renderer can do with it.
//
// Evidence that could not be had is no answer at all, never an empty one.
export const getAvailableBands = recipe => {
    const {bands, availability} = sourceEvidenceOr(recipe, recipe.model?.imageToMask)
    if (availability === UNAVAILABLE) {
        return null
    }
    const availableBands = {}
    bands.forEach(({name, dataType, encoding}) => availableBands[name] = {
        ...(dataType && {dataType}),
        ...(encoding && {encoding})
    })
    return availableBands
}
