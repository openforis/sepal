import _ from 'lodash'

import {normalize} from '~/app/home/map/visParams/visParams'
import {selectFrom} from '~/stateUtils'

export const getPreSetVisualizations = recipe => {
    const legend = selectFrom(recipe, 'model.legend') || {}
    const entries = _.sortBy(legend.entries, 'value') || []
    const min = entries.length ? entries[0].value : 0
    const max = entries.length ? _.last(entries).value : 0
    return [
        normalize({
            type: 'categorical',
            bands: ['transition'],
            min,
            max,
            values: entries.map(({value}) => value),
            labels: entries.map(({label}) => label),
            palette: entries.map(({color}) => color)
        }),
        normalize({
            type: 'continuous',
            bands: ['confidence'],
            min: 0,
            max: 100,
            palette: ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00',
                '#79C900', '#006400']
        })
    ]
}
