export const getAvailableBands = recipe => {
    const availableBands = {}
    const bands = recipe?.model?.assetDetails?.bands || []
    bands.forEach(band => {
        availableBands[band.id] = band
    })
    return availableBands
}

export const getGroupedBandOptions = recipe => {
    return [] // TODO: Implement...
}
