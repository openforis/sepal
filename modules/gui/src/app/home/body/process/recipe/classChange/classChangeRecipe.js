import _ from 'lodash'
import moment from 'moment'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {pyramidingPolicies, submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'

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
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_CLASS_CHANGE_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

export const hasConfidence = recipe => {
    const fromImage = recipe.model.fromImage
    const toImage = recipe.model.toImage
    if (!fromImage || !toImage) {
        return false
    }
    const fromBands = Object.keys(fromImage.bands)
    const fromValues = fromImage.bands[fromImage.band].values
    const toBands = Object.keys(toImage.bands)
    const toValues = fromImage.bands[toImage.band].values

    if (!_.isEqual(new Set(fromValues), new Set(toValues))) {
        return false
    } else {
        const probabilityBands = fromValues.map(value => `probability_${value}`)
        return probabilityBands.every(band => fromBands.includes(band))
            && probabilityBands.every(band => toBands.includes(band))
    }
}

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        pyramidingPolicy: pyramidingPolicies.changeBased('transition')
    })
