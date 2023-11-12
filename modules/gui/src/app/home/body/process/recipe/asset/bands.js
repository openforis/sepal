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
