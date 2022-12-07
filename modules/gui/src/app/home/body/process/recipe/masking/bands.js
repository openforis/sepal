import _ from 'lodash'

export const getAvailableBands = recipe => {
    const bands = recipe.model.imageToMask?.bands || []
    const availableBands = {}
    bands.forEach(band => availableBands[band] = {})
    return availableBands
}

export const getGroupedBandOptions = recipe => {
    const availableBands = getAvailableBands(recipe)
    return [
        Object
            .keys(availableBands)
            .map(band => ({value: band, label: band, ...availableBands[band]}))
    ]
}
