import moment from 'moment'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {defaultModel as defaultOpticalModel} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {defaultModel as defaultPlanetModel} from '~/app/home/body/process/recipe/planetMosaic/planetMosaicRecipe'
import {defaultModel as defaultRadarModel} from '~/app/home/body/process/recipe/radarMosaic/radarMosaicRecipe'
import {pyramidingPolicies, submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'
import {selectFrom} from '~/stateUtils'

import {visualizationOptions} from './visualizations'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    reference: {},
    date: {
        monitoringDuration: 2,
        monitoringDurationUnit: 'months',
        calibrationDuration: 3,
        calibrationDurationUnit: 'months',
        
    },
    sources: {
        cloudPercentageThreshold: 75,
        dataSets: {
            LANDSAT: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM'],
            SENTINEL_2: ['SENTINEL_2']
        }
    },
    options: {
        ...defaultOpticalModel.compositeOptions,
        ...defaultRadarModel.options,
        ...defaultPlanetModel.options,
        corrections: ['SR'],
        cloudDetection: ['QA', 'CLOUD_SCORE'],
        cloudMasking: 'AGGRESSIVE',
        snowMasking: 'ON',
        orbits: ['ASCENDING', 'DECENDING'],
        geometricCorrection: 'ELLIPSOID',
        speckleFilter: 'NONE',
        outlierRemoval: 'NONE',
        orbitOverlap: 'KEEP',
        tileOverlap: 'QUICK_REMOVE',
    },
    changeAlertsOptions: {
        minConfidence: 5,
        numberOfObservations: 3,
        minNumberOfChanges: 3,
        mustBeConfirmedInMonitoring: true,
        mustBeStableBeforeChange: true,
        mustStayChanged: true,
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        setBands(selection, baseBands) {
            return actionBuilder('SET_BANDS', {selection, baseBands})
                .set('ui.bands.selection', selection)
                .set('ui.bands.baseBands', baseBands)
                .dispatch()
        },
        setChartPixel(latLng) {
            return actionBuilder('SET_CHART_PIXEL', latLng)
                .set('ui.chartPixel', latLng)
                .dispatch()
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_CHANGE_ALERTS_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        }
    }
}

export const loadCCDCSegments$ = ({recipe, latLng, bands}) =>
    api.gee.loadCCDCSegments$({recipe: recipe.model.reference, latLng, bands})

// TODO: Might need to tweak the recipe for this
export const loadCCDCObservations$ = ({recipe, latLng, bands}) => {
    const {monitoringEnd, calibrationStart} = toDates(recipe)
    return api.gee.loadTimeSeriesObservations$({
        recipe: {model: {
            dates: {
                startDate: calibrationStart,
                endDate: monitoringEnd
            },
            sources: recipe.model.sources,
            options: recipe.model.options
        }},
        latLng,
        bands
    })
}

export const toDates = recipe => {
    const model = recipe.model
    const monitoringEnd = model.date.monitoringEnd
    const monitoringStart = moment(monitoringEnd, DATE_FORMAT).subtract(model.date.monitoringDuration, model.date.monitoringDurationUnit).format(DATE_FORMAT)
    const calibrationStart = moment(monitoringStart, DATE_FORMAT).subtract(model.date.calibrationDuration, model.date.calibrationDurationUnit).format(DATE_FORMAT)
    return {monitoringEnd, monitoringStart, calibrationStart}
}

export const getAllVisualizations = recipe => {
    const changesVisualizations = visualizationOptions(recipe, 'changes')
        .map(option => option.options ? option.options : option)
        .flat()
        .map(({visParams}) => visParams)
    return recipe.ui.initialized
        ? [
            ...Object.values((selectFrom(recipe, ['layers.userDefinedVisualizations', 'this-recipe']) || {})),
            ...changesVisualizations,
            ...selectFrom(recipe, 'model.reference.visualizations') || []
        ]
        : []
}

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        pyramidingPolicy: pyramidingPolicies.sample
    })
