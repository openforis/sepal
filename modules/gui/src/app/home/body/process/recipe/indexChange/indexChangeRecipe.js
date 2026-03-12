import moment from 'moment'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {pyramidingPolicies, submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'
import {uuid} from '~/uuid'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        fromDate: moment().startOf('year').format(DATE_FORMAT),
        toDate: moment().add(1, 'years').startOf('year').format(DATE_FORMAT)
    },
    legend: {
        entries: [
            {
                id: uuid(),
                color: '#d73027',
                value: 1,
                label: 'Decrease',
                booleanOperator: 'and',
                constraints: [{
                    id: uuid(),
                    description: 'difference < 0',
                    image: 'this-recipe',
                    band: 'difference',
                    operator: '<',
                    value: 0
                }]
            },
            {
                id: uuid(),
                color: '#ffffff',
                value: 2,
                label: 'Stable',
                booleanOperator: 'and',
                constraints: [{
                    id: uuid(),
                    description: 'difference = 0',
                    image: 'this-recipe',
                    band: 'difference',
                    operator: '=',
                    value: 0
                }]
            },
            {
                id: uuid(),
                color: '#1a9850',
                value: 3,
                label: 'Increase',
                booleanOperator: 'and',
                constraints: [{
                    id: uuid(),
                    description: 'difference > 0',
                    image: 'this-recipe',
                    band: 'difference',
                    operator: '>',
                    value: 0
                }]
            }
        ]
    },
    options: {
        minConfidence: 2.5
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
            return actionBuilder('REQUEST_INDEX_CHANGE_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

export const hasError = recipe => {
    const fromImage = recipe.model.fromImage
    const toImage = recipe.model.toImage
    return fromImage && fromImage.errorBand && toImage && toImage.errorBand
}

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        pyramidingPolicy: pyramidingPolicies.changeBased('change')
    })
