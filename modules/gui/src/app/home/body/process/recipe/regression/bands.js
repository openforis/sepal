import _ from 'lodash'

import {msg} from '~/translate'

export const getAvailableBands = () => {
    return {
        regression: {
            dataType: {precision: 'float'},
            label: msg('process.regression.bands.regression')
        }
    }
}

export const getGroupedBandOptions = recipe => {
    const availableBands = getAvailableBands(recipe)
    return [
        Object
            .keys(availableBands)
            .map(band => ({value: band, ...availableBands[band]}))
    ]
}
