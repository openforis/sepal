import {msg} from 'translate'
import {recipeActionBuilder} from '../recipe'
import _ from 'lodash'
import api from 'api'
import moment from 'moment'
import {radarBandOptions} from './bandOptions'

const DATE_FORMAT = 'YYYY-MM-DD'

export const breakDetectionOptions = {
    conservative: {
        minObservations: 6,
        chiSquareProbability: 0.99,
        minNumOfYearsScaler: 1.33,
        lambda: 20,
        maxIterations: 25000
    },

    moderate: {
        minObservations: 4,
        chiSquareProbability: 0.9,
        minNumOfYearsScaler: 1.33,
        lambda: 20,
        maxIterations: 25000
    },

    aggressive: {
        minObservations: 3,
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
    preprocess: {
        corrections: [],
        mask: ['SNOW'],
        orbits: ['ASCENDING'],
        geometricCorrection: 'ELLIPSOID',
        speckleFilter: 'NONE',
        outlierRemoval: 'NONE'
    },
    options: breakDetectionOptions.moderate
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
    const preprocess = {...recipe.model.options, ...recipe.model.preProcessingOptions}
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
        maskSnow: preprocess.mask.includes('SNOW'),
        brdfCorrect: preprocess.corrections.includes('BRDF'),
        surfaceReflectance: preprocess.corrections.includes('SR'),
        ...preprocess,
        ...ccdcOptions
    }
}

export const loadCCDCTimeSeries$ = ({recipe, latLng}) =>
    api.gee.loadCCDCTimeSeries$({recipe: toBackendRecipe({recipe, bands: recipe.model.sources.breakpointBands}), latLng})

const submitRetrieveRecipeTask = recipe => {
    const breakpointBands = recipe.model.sources.breakpointBands
    const task = {
        'operation': 'ccdc.asset_export',
        'params': {
            ...toBackendRecipe({
                recipe,
                bands: [...new Set([...breakpointBands, ...recipe.ui.retrieveOptions.bands])]
            }),
            scale: recipe.ui.retrieveOptions.scale
        }
    }
    return api.tasks.submit$(task).subscribe()
}

export const dateRange = dates => ([moment(dates.startDate, DATE_FORMAT), moment(dates.endDate, DATE_FORMAT)])
