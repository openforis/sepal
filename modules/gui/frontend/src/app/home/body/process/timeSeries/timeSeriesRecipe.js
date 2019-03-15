import {msg} from 'translate'
import {recipePath} from '../recipe'
import api from 'api'
import globalActionBuilder from 'action-builder'
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
    const actionBuilder = (name, props) => {
        return globalActionBuilder(name, props)
            .within(recipePath(id))
    }
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
        'operation': 'sepal.timeseries.download',
        'params':
            {
                title: msg(['process.timeSeries.panel.retrieve.task'], {name}),
                description: name,
                expression: toExpression(recipe.ui.retrieveOptions.indicator),
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

const toExpression = (indicator) => {
    switch (indicator) {
    case 'NDVI':
        return '10000 * (i.nir - i.red) / (i.nir + i.red)'
    case 'NDMI':
        return '10000 * (i.nir - i.swir1) / (i.nir + i.swir1)'
    case 'NDWI':
        return '10000 * (i.green - i.nir) / (i.green + i.nir)'
    case 'NBR':
        return '10000 * (i.nir - i.swir2) / (i.nir + i.swir2)'
    case 'EVI':
        return '10000 * 2.5 * (i.nir - i.red) / (i.nir + 6 * i.red - 7.5 * i.blue + 1)'
    case 'EVI2':
        return '10000 * 2.5 * (i.nir - i.red) / (i.nir + 2.4 * i.red + 1)'
    case 'SAVI':
        return '10000 * 1.5 * (i.nir - i.red) / (i.nir + i.red + 0.5)'
    default:
        throw new Error('Unexpected indicator: ' + indicator)
    }
}

export const dateRange = dates => ([moment(dates.startDate, DATE_FORMAT), moment(dates.endDate, DATE_FORMAT)])
