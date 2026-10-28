import _ from 'lodash'

import {selectFrom} from '~/stateUtils'

export const bandPresentation = recipe => {
    const entries = selectFrom(recipe, 'model.legend.entries') || []
    return {
        transition: {
            dataType: {precision: 'int', min: entries.length ? entries[0].value : 0, max: entries.length ? _.last(entries).value : 0},
            label: 'transition'
        },
        confidence: {
            dataType: {precision: 'int', min: 0, max: 100},
            label: 'confidence'
        }
    }
}

export const groupedBandPresentation = recipe => [
    Object.entries(bandPresentation(recipe)).map(([value, entry]) => ({value, ...entry}))
]
