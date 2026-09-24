import _ from 'lodash'

export const getAvailableBands = recipe => {
    const availableBands = {}
    const bands = recipe?.model?.assetDetails?.bands || []
    bands.forEach(band => {
        availableBands[band.id] = band
    })
    return availableBands
}

export const getGroupedBandOptions = recipe => {
    return [
        Object.keys(getAvailableBands(recipe)).map(band => ({value: band, label: band}))
    ]
}

// Display decoration from the band list saved when the asset was selected, by name: cursor precision and range, as
// Earth Engine reported them. Which bands the recipe provides is its declaration's to say; this only decorates
// those it names, and a band the saved list does not name is left undecorated.
export const bandPresentation = recipe =>
    Object.fromEntries((recipe?.model?.assetDetails?.bands || []).map(({id, data_type: dataType}) => [
        id,
        dataType ? {dataType: _.pick(dataType, ['precision', 'min', 'max'])} : {}
    ]))
