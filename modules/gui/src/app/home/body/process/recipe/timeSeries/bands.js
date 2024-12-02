import _ from 'lodash'

import {msg} from '~/translate'

export const getAvailableBands = () => {
    return {
        count: {
            dataType: {precision: 'int'},
            label: msg('process.timeSeries.bands.count')
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
