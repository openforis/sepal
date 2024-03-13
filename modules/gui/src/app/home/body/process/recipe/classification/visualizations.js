import {normalize} from '~/app/home/map/visParams/visParams'
import {selectFrom} from '~/stateUtils'
import {supportProbability, supportRegression} from './classificationRecipe'
import _ from 'lodash'

export const getPreSetVisualizations = recipe => {
    const legend = selectFrom(recipe, 'model.legend') || {}
    const entries = _.sortBy(legend.entries, 'value') || []
    const classifierType = selectFrom(recipe, 'model.classifier.type')
    const min = entries.length ? entries[0].value : 0
    const max = entries.length ? _.last(entries).value : 0
    const probabilityPalette = ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00',
        '#79C900', '#006400']
    return [
        normalize({
            type: 'categorical',
            bands: ['class'],
            min,
            max,
            values: entries.map(({value}) => value),
            labels: entries.map(({label}) => label),
            palette: entries.map(({color}) => color),
        }),
        supportRegression(classifierType) && normalize({
            type: 'continuous',
            bands: ['regression'],
            min,
            max,
            palette: entries.map(({color}) => color)
        }),
        supportProbability(classifierType) && normalize({
            type: 'continuous',
            bands: ['class_probability'],
            min: 0,
            max: 100,
            palette: probabilityPalette
        }),
        ...entries.map(({value}) => supportProbability(classifierType) && normalize({
            type: 'continuous',
            bands: [`probability_${value}`],
            min: 0,
            max: 100,
            palette: probabilityPalette
        }))
    ].filter(option => option)
}
