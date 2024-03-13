import {hasConfidence} from './classChangeRecipe'
import {selectFrom} from '~/stateUtils'
import _ from 'lodash'

export const getAvailableBands = recipe => {
    const entries = selectFrom(recipe, 'model.legend.entries') || []
    const min = entries.length ? entries[0].value : 0
    const max = entries.length ? _.last(entries).value : 0

    const transition = {
        transition: {
            dataType: {precision: 'int', min, max},
            label: 'transition'
        }
    }

    const confidence = hasConfidence(recipe)
        ? {
            confidence: {
                dataType: {precision: 'int', min: 0, max: 100},
                label: 'confidence'
            }
        }
        : {}
    return {
        ...transition,
        ...confidence
    }
}

export const getGroupedBandOptions = recipe => {
    const availableBands = getAvailableBands(recipe)
    return [
        Object
            .keys(availableBands)
            .map(band => ({value: band, ...availableBands[band]}))
    ]
}
