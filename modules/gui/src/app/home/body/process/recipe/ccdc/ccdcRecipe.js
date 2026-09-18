import _ from 'lodash'
import moment from 'moment'

import {ccdcMeasures} from '#sepal/recipe/type/ccdc'
import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {defaultModel as defaultOpticalModel} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {TEMPORAL_PLANET_BANDS} from '~/app/home/body/process/recipe/planetMosaic/bands'
import {defaultModel as defaultPlanetModel} from '~/app/home/body/process/recipe/planetMosaic/planetMosaicRecipe'
import {defaultModel as defaultRadarModel} from '~/app/home/body/process/recipe/radarMosaic/radarMosaicRecipe'
import {pointInTimeVisualizations} from '~/app/home/body/process/recipe/radarMosaic/visualizations'
import {getTaskInfo} from '~/app/home/body/process/recipe/recipeOutputPath'
import {recipeVisualizationsNaming} from '~/app/home/body/process/recipe/visualizations'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {publishEvent} from '~/eventPublisher'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {toHarmonicVisualization} from './harmonicVisualizations'

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
        cloudPercentageThreshold: 75,
        dataSets: {
            LANDSAT: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
        },
        breakpointBands: ['ndfi']
    },
    options: {
        ...defaultOpticalModel.compositeOptions,
        ...defaultRadarModel.options,
        ...defaultPlanetModel.options,
        corrections: [],
        orbits: ['ASCENDING', 'DESCENDING'],
        geometricCorrection: 'ELLIPSOID',
        spatialSpeckleFilter: 'NONE',
        outlierRemoval: 'NONE',
        orbitOverlap: 'KEEP',
        tileOverlap: 'QUICK_REMOVE',
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
        setClassification({classificationLegend, classifierType} = {}) {
            actionBuilder('SET_CLASSIFICATION', {classificationLegend, classifierType})
                .set('ui.classification', {classificationLegend, classifierType})
                .dispatch()
        }
    }
}

export const getAllVisualizations = recipe => {
    return !_.isEmpty(selectFrom(recipe, ['model.sources.dataSets.SENTINEL_1']))
        ? allRadarMosaicVisualizations()
        : Object.keys(selectFrom(recipe, ['model.sources.dataSets'])).find(source => ['LANDSAT', 'SENTINEL_2'].includes(source))
            ? allOpticalMosaicVisualizations(recipe)
            : allPlanetMosaicVisualizations(recipe)
}

const allOpticalMosaicVisualizations = recipe => {
    const opticalMosaicRecipe = {
        type: 'MOSAIC',
        model: {
            sources: selectFrom(recipe, 'model.sources'),
            compositeOptions: selectFrom(recipe, 'model.options')
        }
    }
    // Templates for the measures this CCDC fits, which its declaration derives from the same optical model.
    const baseVisualizations = recipeVisualizationsNaming(opticalMosaicRecipe, ccdcMeasures({model: recipe.model}))
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
const allRadarMosaicVisualizations = () => {
    return [
        ...pointInTimeVisualizations()
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

const allPlanetMosaicVisualizations = recipe => {
    const sources = selectFrom(recipe, 'model.sources.dataSets')
    const {cloudMasking, cloudBuffer, histogramMatching} = recipe.model.options
    const cloudThreshold = cloudMasking === 'MODERATE' ? 0 : 80

    const planetMosaicRecipe = {
        type: 'PLANET_MOSAIC',
        model: {
            sources: {
                ...sources,
                source: Object.values(sources).flat()[0]
            },
            options: {
                histogramMatching,
                cloudThreshold,
                cloudBuffer
            }
        }
    }
    const baseVisualizations = recipeVisualizationsNaming(planetMosaicRecipe, TEMPORAL_PLANET_BANDS.flat())
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

export const loadCCDCSegments$ = ({recipe, latLng, bands}) =>
    api.gee.loadCCDCSegments$({recipe, latLng, bands})

export const loadCCDCObservations$ = ({recipe, latLng, bands}) =>
    api.gee.loadTimeSeriesObservations$({
        recipe, latLng, bands
    })

// CCDC's own export: the measures asked for, fitted with the breakpoint bands and exported with every band they
// produce, under `sample` throughout (modules/task/src/tasks/ccdcAssetExport.js). The templates attached are all
// CCDC offers; the task keeps those whose bands the export derives - `red`, `red_intercept`, `red_phase_1` - which
// no filter over the stored `red_coefs` could decide.
export const submitRetrieveTask = ({recipe, retrieveOptions}) => {
    const name = recipe.title || recipe.placeholder
    const bands = retrieveOptions.bands
    const destination = 'GEE'
    const taskTitle = msg(['process.retrieve.form.task.GEE'], {name})
    const visualizations = getAllVisualizations(recipe)
    const [timeStart, timeEnd] = (getRecipeType(recipe.type).getDateRange(recipe) || []).map(date => date.valueOf())
    const operation = 'ccdc.GEE'
    const recipeProperties = {
        recipe_id: recipe.id,
        recipe_projectId: recipe.folderId,
        recipe_type: recipe.type,
        recipe_title: recipe.title || recipe.placeholder,
        ..._(recipe.model)
            .mapValues(value => JSON.stringify(value))
            .mapKeys((_value, key) => `recipe_${key}`)
            .value()
    }
    const task = {
        operation,
        params: {
            title: taskTitle,
            description: name,
            image: {
                ...retrieveOptions,
                recipe: _.omit(recipe, ['ui']),
                bands,
                visualizations,
                properties: {...recipeProperties, 'system:time_start': timeStart, 'system:time_end': timeEnd}
            },
            taskInfo: getTaskInfo({
                recipe,
                destination,
                retrieveOptions
            })
        }
    }
    publishEvent('submit_task', {
        recipe_type: recipe.type,
        destination: 'GEE',
        data_set_type: recipe.model.dataSetType
    })
    return api.tasks.submit$(task).subscribe()
}

export const dateRange = dates => ([moment.utc(dates.startDate, DATE_FORMAT), moment.utc(dates.endDate, DATE_FORMAT)])
