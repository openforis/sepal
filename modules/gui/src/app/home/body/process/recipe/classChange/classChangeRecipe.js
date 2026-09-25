import _ from 'lodash'
import moment from 'moment'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        fromDate: moment().startOf('year').format(DATE_FORMAT),
        toDate: moment().add(1, 'years').startOf('year').format(DATE_FORMAT)
    },
    options: {
        cloudThreshold: 0.15,
        shadowThreshold: 0.4
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    const setAll = (name, values, otherProps) =>
        actionBuilder(name, otherProps)
            .setAll(values)
            .build()

    return {
        setBands(bands) {
            return setAll('SET_BANDS', {
                'ui.bands.selection': bands
            }, {bands})
        },
    }
}

// Whether the source snapshots saved when each image was selected hold the same classes, each with its probability
// band. A snapshot is what the source held then, so this is a hint, not evidence that a confidence can be computed.
export const hasConfidence = recipe => {
    const fromImage = recipe.model.fromImage
    const toImage = recipe.model.toImage
    if (!fromImage || !toImage) {
        return false
    }
    const fromBands = Object.keys(fromImage.bands)
    const fromValues = fromImage.bands[fromImage.band].values
    const toBands = Object.keys(toImage.bands)
    const toValues = toImage.bands[toImage.band].values

    if (!_.isEqual(new Set(fromValues), new Set(toValues))) {
        return false
    } else {
        const probabilityBands = fromValues.map(value => `probability_${value}`)
        return probabilityBands.every(band => fromBands.includes(band))
            && probabilityBands.every(band => toBands.includes(band))
    }
}

export const retrieveTask = {}
