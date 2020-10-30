import {msg} from 'translate'
import {recipeActionBuilder} from '../../recipe'
import _ from 'lodash'
import api from 'api'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const breakDetectionOptions = {
    conservative: {
        dateFormat: 1,
        minObservations: 6,
        chiSquareProbability: 0.99,
        minNumOfYearsScaler: 1.33,
        lambda: 20,
        maxIterations: 25000
    },

    moderate: {
        dateFormat: 1,
        minObservations: 6,
        chiSquareProbability: 0.9,
        minNumOfYearsScaler: 1.33,
        lambda: 20,
        maxIterations: 25000
    },

    aggressive: {
        dateFormat: 1,
        minObservations: 4,
        chiSquareProbability: 0.75,
        minNumOfYearsScaler: 1.33,
        lambda: 20,
        maxIterations: 25000
    }
}

export const defaultModel = {
    dates: {
        startDate: '2000-01-01',
        endDate: moment().format(DATE_FORMAT)
    },
    sources: {
        dataSets: {
            LANDSAT: ['LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
        },
        breakpointBands: ['ndfi']
    },
    options: {
        corrections: [],
        cloudMasking: 'AGGRESSIVE',
        shadowMasking: 'OFF',
        snowMasking: 'ON',
        orbits: ['ASCENDING', 'DESCENDING'],
        geometricCorrection: 'ELLIPSOID',
        speckleFilter: 'NONE',
        outlierRemoval: 'NONE'
    },
    ccdcOptions: breakDetectionOptions.moderate
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
                .build()
        }
    }
}

function toBackendRecipe({recipe, bands}) {
    const name = recipe.title || recipe.placeholder
    const preprocess = recipe.model.options
    const ccdcOptions = recipe.model.ccdcOptions
    const breakpointBands = recipe.model.sources.breakpointBands
    return {
        title: msg(['process.ccdc.panel.retrieve.task'], {name}),
        description: name,
        bands,
        breakpointBands,
        dataSets: _.flatten(Object.values(recipe.model.sources.dataSets)),
        aoi: recipe.model.aoi,
        fromDate: recipe.model.dates.startDate,
        toDate: recipe.model.dates.endDate,
        brdfCorrect: preprocess.corrections.includes('BRDF'),
        surfaceReflectance: preprocess.corrections.includes('SR'),
        calibrate: true,
        ...preprocess,
        ...ccdcOptions
    }
}

export const loadCCDCTimeSeries$ = ({recipe, latLng, bands}) =>
    api.gee.loadCCDCTimeSeries$({recipe: toBackendRecipe({
        recipe,
        bands
    }), latLng})

const submitRetrieveRecipeTask = recipe => {
    const task = {
        'operation': 'ccdc.asset_export',
        'params': {
            ...toBackendRecipe({
                recipe,
                bands: recipe.ui.retrieveOptions.bands
            }),
            scale: recipe.ui.retrieveOptions.scale
        }
    }
    return api.tasks.submit$(task).subscribe()
}

export const dateRange = dates => ([moment(dates.startDate, DATE_FORMAT), moment(dates.endDate, DATE_FORMAT)])
