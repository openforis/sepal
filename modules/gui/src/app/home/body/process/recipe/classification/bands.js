import _ from 'lodash'

import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {supportProbability, supportRegression} from './classificationRecipe'

export const getAvailableBands = recipe => {
    const entries = selectFrom(recipe, 'model.legend.entries') || []
    const classifierType = selectFrom(recipe, 'model.classifier.type')
    const min = entries.length ? entries[0].value : 0
    const max = entries.length ? _.last(entries).value : 0
    const classBand = {class: {
        dataType: {precision: 'int', min, max},
        label: msg('process.classification.bands.class')
    }}
    const regressionBand = supportRegression(classifierType)
        ? {regression: {
            dataType: {precision: 'float', min, max},
            label: msg('process.classification.bands.regression')
        }}
        : {}
    const classProbabilityBand = supportProbability(classifierType)
        ? {class_probability: {
            dataType: {precision: 'int', min: 0, max: 100},
            label: msg('process.classification.bands.classProbability')
        }}
        : {}

    const entryProbabilityBands = supportProbability(classifierType)
        ? _.chain(entries)
            .keyBy(({value}) => `probability_${value}`)
            .mapValues(({label}) => {
                return ({
                    dataType: {precision: 'int', min: 0, max: 100},
                    label: msg('process.classification.bands.probability', {class: label})
                })
            })
            .value()
        : {}
    return {
        ...classBand,
        ...regressionBand,
        ...classProbabilityBand,
        ...entryProbabilityBands
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
