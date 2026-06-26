import moment from 'moment'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'

const DATE_FORMAT = 'YYYY-MM-DD'

export const NICFI_ASSETS = [
    'projects/planet-nicfi/assets/basemaps/africa',
    'projects/planet-nicfi/assets/basemaps/asia',
    'projects/planet-nicfi/assets/basemaps/americas'
]

const defaultFromDate = moment().subtract(2, 'month').startOf('year')
export const defaultModel = {
    dates: {
        fromDate: defaultFromDate.format(DATE_FORMAT),
        toDate: moment.min(
            moment(),
            defaultFromDate.add(1, 'year')
        ).format(DATE_FORMAT)
    },
    sources: {
        source: 'NICFI',
        histogramMatching: 'DISABLED'
    },
    options: {
        cloudThreshold: 0.15,
        shadowThreshold: 0.4,
        cloudBuffer: 0
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
            return actionBuilder('REQUEST_PLANET_MOSAIC_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        dataSetType: 'PLANET'
    })
