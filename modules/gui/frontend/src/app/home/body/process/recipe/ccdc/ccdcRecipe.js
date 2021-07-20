import {getRecipeType} from '../../recipeTypes'
import {msg} from 'translate'
import {getAllVisualizations as opticalMosaicVisualizations} from '../opticalMosaic/opticalMosaicRecipe'
import {getAllVisualizations as radarMosaicVisualizations} from '../radarMosaic/radarMosaicRecipe'
import {recipeActionBuilder} from '../../recipe'
import {selectFrom} from 'stateUtils'
import {toHarmonicVisualization} from './harmonicVisualizations'
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
        cloudDetection: ['QA', 'CLOUD_SCORE'],
        cloudMasking: 'MODERATE',
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
                .dispatch()
        },
        setClassification({classificationLegend, classifierType} = {}) {
            actionBuilder('SET_CLASSIFICATION', {classificationLegend, classifierType})
                .set('ui.classification', {classificationLegend, classifierType})
                .dispatch()
        }
    }
}

export const getAllVisualizations = recipe => {
    return _.isEmpty(selectFrom(recipe, ['model.sources.dataSets.SENTINEL_1']))
        ? allOpticalMosaicVisualizations(recipe)
        : allRadarMosaicVisualizations(recipe)
}

const allOpticalMosaicVisualizations = recipe => {
    const opticalMosaicRecipe = {
        model: {
            sources: selectFrom(recipe, 'model.sources.dataSets'),
            compositeOptions: selectFrom(recipe, 'model.options')
        }
    }
    const baseVisualizations = opticalMosaicVisualizations(opticalMosaicRecipe)
        .map(visParams => ({...visParams, baseBands: [...new Set(visParams.bands)]}))
    const harmonicVisualizations = baseVisualizations
        .filter(({type}) => type === 'continuous')
        .map(({bands}) => bands[0])
        .map(toHarmonicVisualization)
        .filter(v => v)
    return [
        ...baseVisualizations,
        ...harmonicVisualizations
    ]
}

const RADAR_BAND_SCALE = 100
const allRadarMosaicVisualizations = recipe => {
    const radarMosaicRecipe = {
        model: {
            options: selectFrom(recipe, 'model.options')
        }
    }
    return [
        ...radarMosaicVisualizations(radarMosaicRecipe)
            .map(visParams => ({
                ...visParams,
                min: visParams.min.map(min => min * RADAR_BAND_SCALE),
                max: visParams.max.map(max => max * RADAR_BAND_SCALE),
                baseBands: [...new Set(visParams.bands)]
            })),
        toHarmonicVisualization('VV'),
        toHarmonicVisualization('VH'),
        toHarmonicVisualization('ratio_VV_VH'),
    ]
}

export const loadCCDCSegments$ = ({recipe, latLng, bands}) =>
    api.gee.loadCCDCSegments$({recipe, latLng, bands})

export const loadCCDCObservations$ = ({recipe, latLng, bands}) =>
    api.gee.loadTimeSeriesObservations$({
        recipe, latLng, bands
    })

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const title = msg(['process.retrieve.form.task.GEE'], {name})
    const visualizations = getAllVisualizations(recipe)
    const [timeStart, timeEnd] = (getRecipeType(recipe.type).getDateRange(recipe) || []).map(date => date.valueOf())
    const task = {
        'operation': 'ccdc.asset_export',
        'params': {
            title,
            description: name,
            recipe: _.omit(recipe, ['ui']),
            bands: recipe.ui.retrieveOptions.bands,
            visualizations,
            scale: recipe.ui.retrieveOptions.scale,
            properties: {'system:time_start': timeStart, 'system:time_end': timeEnd}
        }
    }
    return api.tasks.submit$(task).subscribe()
}

export const dateRange = dates => ([moment.utc(dates.startDate, DATE_FORMAT), moment.utc(dates.endDate, DATE_FORMAT)])
