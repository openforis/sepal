import {sourceEvidenceOr} from '../sourceEvidence'

// The bands Masking outputs are the primary image's, because applying a mask changes which pixels are valid
// and nothing about the schema. Current evidence answers that whenever it exists; the band names copied into
// the model when the source was selected are only what remains when it does not.
//
// Observed dimensionality rides along, because deciding what may be drawn needs it. It never removes a band:
// an array band stays here, and stays exportable, whatever a renderer can do with it.
export const getAvailableBands = recipe => {
    const {bands} = sourceEvidenceOr(recipe, recipe.model?.imageToMask)
    const availableBands = {}
    bands.forEach(({name, dataType}) => availableBands[name] = dataType ? {dataType} : {})
    return availableBands
}

export const getGroupedBandOptions = recipe => [
    Object.keys(getAvailableBands(recipe)).map(band => ({value: band, label: band}))
]
