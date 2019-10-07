import api from 'api'
import _ from 'lodash'
import moment from 'moment'
import {msg} from 'translate'
import {recipeActionBuilder} from '../recipe'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        startDate: '2000-01-01',
        endDate: moment().format(DATE_FORMAT)
    },
    sources: {
        LANDSAT: ['LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
    },
    options: {
        corrections: [],
        mask: ['SNOW'],
        orbits: ['ASCENDING'],
        geometricCorrection: 'ELLIPSOID',
        speckleFilter: 'NONE',
        outlierRemoval: 'NONE',
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
    const options = {...recipe.model.options, ...recipe.model.preProcessingOptions}
    const task = {
        'operation': 'timeseries.download',
        'params':
            {
                title: msg(['process.timeSeries.panel.retrieve.task'], {name}),
                description: name,
                indicator: recipe.ui.retrieveOptions.indicator,
                scale: recipe.ui.retrieveOptions.scale,
                dataSets: _.flatten(Object.values(recipe.model.sources)),
                aoi: recipe.model.aoi,
                fromDate: recipe.model.dates.startDate,
                toDate: recipe.model.dates.endDate,
                maskSnow: options.mask.includes('SNOW'),
                brdfCorrect: options.corrections.includes('BRDF'),
                surfaceReflectance: options.corrections.includes('SR'),
                ...options,
            }
    }
    return api.tasks.submit$(task).subscribe()
}

export const dateRange = dates => ([moment(dates.startDate, DATE_FORMAT), moment(dates.endDate, DATE_FORMAT)])
