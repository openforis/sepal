import {msg} from 'translate'
import {recipeActionBuilder} from '../../recipe'
import _ from 'lodash'
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

const toBackendRecipe = recipe => {
    const name = recipe.title || recipe.placeholder
    const options = {...recipe.model.options, ...recipe.model.preProcessingOptions}
    const indicator = recipe.ui.retrieveOptions
        ? recipe.ui.retrieveOptions.bands
        : null
    return {
        title: msg(['process.timeSeries.panel.retrieve.task'], {name}),
        description: name,
        indicator,
        dataSets: _.flatten(Object.values(recipe.model.sources.dataSets)),
        classification: recipe.model.sources.classification,
        aoi: recipe.model.aoi,
        fromDate: recipe.model.dates.startDate,
        toDate: recipe.model.dates.endDate,
        brdfCorrect: options.corrections.includes('BRDF'),
        surfaceReflectance: options.corrections.includes('SR'),
        ...options
    }
}

const submitRetrieveRecipeTask = recipe => {
    const task = {
        'operation': 'timeseries.download',
        'params': {
            ...toBackendRecipe(recipe),
            scale: recipe.ui.retrieveOptions.scale
        }
    }
    return api.tasks.submit$(task).subscribe()
}

export const loadObservations$ = ({recipe, latLng, bands}) =>
    api.gee.loadTimeSeriesObservations$({
        recipe: {...toBackendRecipe(recipe), bands},
        latLng
    })

export const dateRange = dates => ([moment(dates.startDate, DATE_FORMAT), moment(dates.endDate, DATE_FORMAT)])
