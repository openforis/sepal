import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import _ from 'lodash'

export const getAvailableBands = recipe => {
    const entries = selectFrom(recipe, 'model.legend.entries') || []
    const min = entries.length ? entries[0].value : 0
    const max = entries.length ? _.last(entries).value : 0
    return {class: {
        dataType: {precision: 'int', min, max},
        label: msg('process.classification.bands.class')
    }}
}

export const getGroupedBandOptions = recipe => {
    const availableBands = getAvailableBands(recipe)
    const toOption = band => ({value: band, ...availableBands[band]})
    return Object.keys(availableBands)
        .map(toOption)
}
