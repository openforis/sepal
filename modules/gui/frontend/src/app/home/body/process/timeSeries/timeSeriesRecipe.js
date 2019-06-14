import {msg} from 'translate'
import {recipeActionBuilder} from '../recipe'
import api from 'api'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        startDate: '2000-01-01',
        endDate: moment().format(DATE_FORMAT)
    },
    sources: {
        LANDSAT: ['LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
    },
    preProcessingOptions: {
        corrections: ['SR', 'BRDF'],
        mask: ['SNOW']
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_MOSAIC_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .build()
        }
    }
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const task = {
        'operation': 'timeseries.download',
        'params':
            {
                title: msg(['process.timeSeries.panel.retrieve.task'], {name}),
                description: name,
                indicator: recipe.ui.retrieveOptions.indicator,
                dataSets: recipe.model.sources[Object.keys(recipe.model.sources)[0]],
                aoi: recipe.model.aoi,
                fromDate: recipe.model.dates.startDate,
                toDate: recipe.model.dates.endDate,
                maskSnow: recipe.model.preProcessingOptions.mask.includes('SNOW'),
                brdfCorrect: recipe.model.preProcessingOptions.corrections.includes('BRDF'),
                surfaceReflectance: recipe.model.preProcessingOptions.corrections.includes('SR')
            }
    }
    return api.tasks.submit$(task).subscribe()
}

export const dateRange = dates => ([moment(dates.startDate, DATE_FORMAT), moment(dates.endDate, DATE_FORMAT)])
