import _ from 'lodash'

import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

export const bandPresentation = recipe => {
    const entries = selectFrom(recipe, 'model.legend.entries') || []
    return {
        class: {
            dataType: {precision: 'int', min: entries.length ? entries[0].value : 0, max: entries.length ? _.last(entries).value : 0},
            label: msg('process.classification.bands.class')
        }
    }
}

export const groupedBandPresentation = recipe => [
    Object.entries(bandPresentation(recipe)).map(([value, entry]) => ({value, ...entry}))
]
