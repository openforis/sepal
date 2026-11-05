import _ from 'lodash'

import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

// In the order execution builds them; which of them a configured recipe has is its declaration's to say.
export const bandPresentation = recipe => {
    const entries = selectFrom(recipe, 'model.legend.entries') || []
    const min = entries.length ? entries[0].value : 0
    const max = entries.length ? _.last(entries).value : 0
    const percentage = {precision: 'int', min: 0, max: 100}
    return {
        class: {
            dataType: {precision: 'int', min, max},
            label: msg('process.classification.bands.class')
        },
        class_probability: {
            dataType: percentage,
            label: msg('process.classification.bands.classProbability')
        },
        regression: {
            dataType: {precision: 'float', min, max},
            label: msg('process.classification.bands.regression')
        },
        ...Object.fromEntries(entries.map(({value, label}) => [`probability_${value}`, {
            dataType: percentage,
            label: msg('process.classification.bands.probability', {class: label})
        }]))
    }
}

// What a Classification's output is called where no record of it names it: a class's probability by the class's value,
// which is all its name says of it, and the regression as itself.
export const classifiedOutputFallbackLabel = band => band === 'regression'
    ? msg('process.classification.bands.regression')
    : msg('process.classification.bands.classValueProbability', {value: band.replace(/^probability_/, '')})

export const groupedBandPresentation = recipe => [
    Object.entries(bandPresentation(recipe)).map(([value, entry]) => ({value, ...entry}))
]
