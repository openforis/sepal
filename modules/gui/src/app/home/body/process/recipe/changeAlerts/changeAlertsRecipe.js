import {monitoringDates} from '#sepal/recipe/changeAlerts/monitoringDates'
import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {defaultModel as defaultOpticalModel} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {defaultModel as defaultPlanetModel} from '~/app/home/body/process/recipe/planetMosaic/planetMosaicRecipe'
import {defaultModel as defaultRadarModel} from '~/app/home/body/process/recipe/radarMosaic/radarMosaicRecipe'

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

export const loadCCDCSegments$ = ({recipe, latLng, bands}) =>
    api.gee.loadCCDCSegments$({recipe: recipe.model.reference, latLng, bands})

// TODO: Might need to tweak the recipe for this
export const loadCCDCObservations$ = ({recipe, latLng, bands}) => {
    const {monitoringEnd, calibrationStart} = monitoringDates(recipe.model)
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
