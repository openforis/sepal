import _ from 'lodash'

import {selectFrom} from '~/stateUtils'

// Change first, as the band control has always listed them; which of them a configured recipe has is its
// declaration's to say.
export const bandPresentation = recipe => {
    const entries = selectFrom(recipe, 'model.legend.entries') || []
    return {
        change: {
            dataType: {precision: 'int', min: entries.length ? entries[0].value : 0, max: entries.length ? _.last(entries).value : 0},
            label: 'change'
        },
        difference: {dataType: {precision: 'double'}, label: 'difference'},
        normalized_difference: {dataType: {precision: 'float'}, label: 'normalized_difference'},
        ratio: {dataType: {precision: 'float'}, label: 'ratio'},
        error: {dataType: {precision: 'float'}, label: 'error'},
        confidence: {dataType: {precision: 'float'}, label: 'confidence'}
    }
}

export const groupedBandPresentation = recipe => [
    Object.entries(bandPresentation(recipe)).map(([value, entry]) => ({value, ...entry}))
]
