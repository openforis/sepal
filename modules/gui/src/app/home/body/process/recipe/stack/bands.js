import _ from 'lodash'

export const getAvailableBands = recipe => {
    const bands = {}
    recipe.model.bandNames.bandNames
        .map(({bands}) => bands
            .map(({outputName}) => {
                return outputName
            })
        )
        .flat()
        .forEach(band => bands[band] = {label: band})
    return bands
}

export const getGroupedBandOptions = recipe => {
    const availableBands = getAvailableBands(recipe)
    return [
        Object
            .keys(availableBands)
            .map(band => ({value: band, ...availableBands[band]}))
    ]
}
