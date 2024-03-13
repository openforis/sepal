import {normalize} from '~/app/home/map/visParams/visParams'
import {selectFrom} from '~/stateUtils'
import _ from 'lodash'

export const getPreSetVisualizations = recipe => {
    const legend = selectFrom(recipe, 'model.legend') || {}
    const entries = _.sortBy(legend.entries, 'value') || []
    const min = entries.length ? entries[0].value : 0
    const max = entries.length ? _.last(entries).value : 0

    return [normalize({
        type: 'categorical',
        bands: ['class'],
        min,
        max,
        values: entries.map(({value}) => value),
        labels: entries.map(({label}) => label),
        palette: entries.map(({color}) => color),
    })]
}
