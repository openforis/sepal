import _ from 'lodash'

import {msg} from '~/translate'

export const getAvailableBands = () => {
    return {
        count: {
            dataType: {precision: 'int'},
            label: msg('process.ccdc.bands.count')
        }
    }
}

// The layer shows how many observations were fitted; the segments CCDC outputs are what the recipes reading it
// describe. Named, so that a layer can never be answered with one while it shows the other.
export const mapProducts = {
    defaults: {visualizationType: 'COUNT'},
    productOf: ({visualizationType}) =>
        visualizationType === 'COUNT' ? {name: 'COUNT'} : null,
    bands: (recipe, {name}) =>
        name === 'COUNT' ? getAvailableBands(recipe) : undefined
}

export const getGroupedBandOptions = recipe => {
    const availableBands = getAvailableBands(recipe)
    return [
        Object
            .keys(availableBands)
            .map(band => ({value: band, ...availableBands[band]}))
    ]
}
