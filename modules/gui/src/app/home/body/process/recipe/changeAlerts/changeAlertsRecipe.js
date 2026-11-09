import _ from 'lodash'
import {throwError} from 'rxjs'

import {availableMeasures, MONITORING_TYPES} from '#sepal/recipe/changeAlerts/monitoringMeasures'
import {dataSetPeriod} from '#sepal/recipe/type/changeAlerts'
import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {defaultModel as defaultOpticalModel} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {defaultModel as defaultPlanetModel} from '~/app/home/body/process/recipe/planetMosaic/planetMosaicRecipe'
import {defaultModel as defaultRadarModel} from '~/app/home/body/process/recipe/radarMosaic/radarMosaicRecipe'
import {defaultDataSet} from '~/sources'

import {settingsOf} from './processingSettings'

// The data sets a new recipe's Sources start with, as far as its calibration and monitoring years let them contribute
// (initialSources.js): those its reference preferred as it was first applied (`seededDataSets`, reference.jsx), or
// otherwise optical ones.
export const initialSources = {
    dataSets: recipe => recipe.ui?.seededDataSets || OPTICAL_DATA_SETS,
    period: dataSetPeriod
}

// What a reference first applied prefers Sources to start with, from what its accepted facts say: the data sets its
// processing records it was fitted from (`recorded`, as seedMonitoring gives its sources); else those of the monitoring
// type recorded; else those of the first type whose data observe a measure its segments were fitted for (`measures`),
// optical before radar. Optical ones are the usual data sets, another type's its first. Null where nothing says.
export const referenceDataSets = ({dataSets, dataSetType} = {}, measures = []) => {
    if (!_.isEmpty(dataSets)) {
        return _.uniq(Object.values(dataSets).flat())
    }
    const type = MONITORING_TYPES.includes(dataSetType)
        ? dataSetType
        : MONITORING_TYPES.find(type => availableMeasures(type).some(measure => measures.includes(measure)))
    return type === 'OPTICAL' ? OPTICAL_DATA_SETS : type ? [defaultDataSet(type)] : null
}

const OPTICAL_DATA_SETS = ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM', 'SENTINEL_2']

export const defaultModel = {
    reference: {},
    date: {
        monitoringDuration: 2,
        monitoringDurationUnit: 'months',
        calibrationDuration: 3,
        calibrationDurationUnit: 'months',
        
    },
    sources: {
        cloudPercentageThreshold: 75
    },
    options: {
        ...defaultOpticalModel.compositeOptions,
        ...defaultRadarModel.options,
        ...defaultPlanetModel.options,
        corrections: ['SR'],
        cloudDetection: ['QA', 'CLOUD_SCORE'],
        cloudMasking: 'AGGRESSIVE',
        snowMasking: 'ON',
        orbits: ['ASCENDING', 'DESCENDING'],
        geometricCorrection: 'ELLIPSOID',
        spatialSpeckleFilter: 'NONE',
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
    }
}

export const loadCCDCSegments$ = ({recipe, latLng, bands}) => {
    const model = settingsOf(recipe).model
    return model ? api.gee.loadCCDCSegments$({recipe: model.reference, latLng, bands})
        : throwError(() => new Error('Reference processing settings are not available'))
}

// The monitoring imagery's observations of a band of its own: the server derives the collection this recipe observes,
// and judges it, from the recipe as applied (observedCollection, lib/js/shared/src/recipe/changeAlerts).
export const loadCCDCObservations$ = ({recipe, latLng, bands}) =>
    api.gee.loadTimeSeriesObservations$({recipe, latLng, bands})
