import _ from 'lodash'

import {msg} from '~/translate'

import {getMaxNumberofClusters} from './unsupervisedClassificationRecipe'

export const getAvailableBands = recipe => {
    return {
        class: {
            dataType: {precision: 'int', min: 0, max: getMaxNumberofClusters(recipe) - 1},
            label: msg('process.unsupervisedClassification.bands.class')
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
