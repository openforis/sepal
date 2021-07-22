import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {supportProbability, supportRegression} from './classificationRecipe'
import _ from 'lodash'

export const getAvailableBands = recipe => {
    const entries = selectFrom(recipe, 'model.legend.entries') || []
    const classifierType = selectFrom(recipe, 'model.classifier.type')
    if (!classifierType) {
        return {}
    }
    const min = entries[0].value
    const max = _.last(entries).value
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
    const toOption = band => ({value: band, ...availableBands[band]})
    return Object.keys(availableBands)
        .map(toOption)
}
