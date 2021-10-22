import {hasError} from './indexChangeRecipe'
import {selectFrom} from 'stateUtils'
import _ from 'lodash'

export const getAvailableBands = recipe => {
    const entries = selectFrom(recipe, 'model.legend.entries') || []
    const min = entries.length ? entries[0].value : 0
    const max = entries.length ? _.last(entries).value : 0

    const change = {
        change: {
            dataType: {precision: 'int', min, max},
            label: 'change'
        }
    }
    const difference = {
        difference: {
            dataType: {precision: 'double'},
            label: 'difference'
        }
    }

    const error = hasError(recipe)
        ? {
            error: {
                dataType: {precision: 'float'},
                label: 'error'
            }
        }
        : {}

    return {
        ...change,
        ...difference,
        ...error
    }
}

export const getGroupedBandOptions = recipe => {
    const availableBands = getAvailableBands(recipe)
    const toOption = band => ({value: band, ...availableBands[band]})
    return Object.keys(availableBands)
        .map(toOption)
}
