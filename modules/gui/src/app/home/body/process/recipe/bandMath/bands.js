import _ from 'lodash'

export const getAvailableBands = recipe => {
    const bands = {}
    recipe.model.outputBands.outputImages
        .map(({outputBands}) => outputBands
            .map(({outputName, defaultOutputName}) =>
                outputName || defaultOutputName)
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
