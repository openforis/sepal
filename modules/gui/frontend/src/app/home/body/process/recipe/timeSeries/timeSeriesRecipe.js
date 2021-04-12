import {msg} from 'translate'
import {recipeActionBuilder} from '../../recipe'
import api from 'api'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        startDate: '2000-01-01',
        endDate: moment().format(DATE_FORMAT)
    },
    sources: {
        dataSets: {
            LANDSAT: ['LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
        }
    },
    options: {
        corrections: [],
        cloudMasking: 'AGGRESSIVE',
        snowMasking: 'OFF',
        orbits: ['ASCENDING', 'DECENDING'],
        geometricCorrection: 'ELLIPSOID',
        speckleFilter: 'NONE',
        outlierRemoval: 'NONE'
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        setChartPixel(latLng) {
            return actionBuilder('SET_CHART_PIXEL', latLng)
                .set('ui.chartPixel', latLng)
                .build()
                .dispatch()
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_MOSAIC_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
        setClassification({classificationLegend, classifierType} = {}) {
            actionBuilder('SET_CLASSIFICATION', {classificationLegend, classifierType})
                .set('ui.classification', {classificationLegend, classifierType})
                .dispatch()
        }
    }
}

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const title = msg(['process.retrieve.task'], {name})
    const task = {
        'operation': 'timeseries.download',
        'params': {
            title,
            description: name,
            recipe,
            indicator: recipe.ui.retrieveOptions.bands,
            scale: recipe.ui.retrieveOptions.scale,
        }
    }
    return api.tasks.submit$(task).subscribe()
}

export const loadObservations$ = ({recipe, latLng, bands}) =>
    api.gee.loadTimeSeriesObservations$({
        recipe, latLng, bands
    })

export const dateRange = dates => ([moment(dates.startDate, DATE_FORMAT), moment(dates.endDate, DATE_FORMAT)])
