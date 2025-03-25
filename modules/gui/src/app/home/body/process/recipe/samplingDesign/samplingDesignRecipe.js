import moment from 'moment'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {publishEvent} from '~/eventPublisher'
import {msg} from '~/translate'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    stratification: {
        scale: 30,
        type: 'ASSET'
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_MOSAIC_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

const submitRetrieveRecipeTask = recipe => {
    const destination = recipe.ui.retrieveOptions.destination
    const operation = `samplingDesign.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`
    const name = recipe.title || recipe.placeholder
    const title = msg(['process.retrieve.form.task.SEPAL'], {name})
    const task = {
        operation,
        params: {
            title,
            description: name,
            recipe,
            ...recipe.ui.retrieveOptions
        }
    }
    publishEvent('submit_task', {
        recipe_type: recipe.type,
        destination: 'SEPAL',
        data_set_type: recipe.model.dataSetType
    })
    return api.tasks.submit$(task).subscribe()
}

export const loadObservations$ = ({recipe, latLng, bands}) =>
    api.gee.loadTimeSeriesObservations$({
        recipe, latLng, bands
    })

export const dateRange = dates => ([moment(dates.startDate, DATE_FORMAT), moment(dates.endDate, DATE_FORMAT)])
