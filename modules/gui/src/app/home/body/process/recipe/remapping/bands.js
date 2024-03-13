import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import _ from 'lodash'

export const getAvailableBands = recipe => {
    const entries = selectFrom(recipe, 'model.legend.entries')
    if (!entries || !entries.length) {
        return {}
    }
    const min = entries[0].value
    const max = _.last(entries).value
    return {class: {
        dataType: {precision: 'int', min, max},
        label: msg('process.classification.bands.class')
    }}
}

export const getGroupedBandOptions = recipe => {
    const availableBands = getAvailableBands(recipe)
    return [
        Object
            .keys(availableBands)
            .map(band => ({value: band, ...availableBands[band]}))
    ]
}
