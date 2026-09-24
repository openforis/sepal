import {hasMonitoringDates} from '#sepal/recipe/changeAlerts/monitoringDates'
import {mosaicRecipe} from '#sepal/recipe/changeAlerts/mosaicRecipe'
import {getAvailableBands as opticalBands} from '~/app/home/body/process/recipe/opticalMosaic/bands'
import {getAvailableBands as planetBands} from '~/app/home/body/process/recipe/planetMosaic/bands'
import {getAvailableBands as radarBands} from '~/app/home/body/process/recipe/radarMosaic/bands'

import {IMAGE_OUTPUT} from '../legacyOutput'

const typeFloat = {precision: 'float'}

// Which helper describes a mosaic, keyed by the recipe type its projection names.
const MOSAIC_BANDS = {
    MOSAIC: opticalBands,
    RADAR_MOSAIC: radarBands,
    PLANET_MOSAIC: planetBands
}

export const getAvailableBands = (recipe, visualizationType, mosaicType) =>
    visualizationType === 'changes'
        ? changesBands()
        : mosaicBands(recipe, visualizationType, mosaicType)

const PERIODS = ['monitoring', 'calibration']
const MOSAIC_TYPES = ['latest', 'median']

// The changes are the output; a layer may instead show the mosaic a period is compared on. A recipe whose mosaic
// cannot be described shows nothing in any mode, as the generic layer has always decided from its mode-less
// answer. Whether the changes themselves need that mosaic has not been traced, so the guard stands.
export const mapProducts = {
    defaults: {visualizationType: 'changes', mosaicType: 'latest'},
    productOf: ({visualizationType, mosaicType}) => {
        if (visualizationType === 'changes') {
            return {name: IMAGE_OUTPUT}
        }
        return PERIODS.includes(visualizationType) && MOSAIC_TYPES.includes(mosaicType)
            ? {name: 'COLLECTION_MOSAIC', parameters: {period: visualizationType, mosaicType}}
            : null
    },
    bands: (recipe, {name, parameters}) => {
        if (!Object.keys(getAvailableBands(recipe)).length) {
            return {}
        }
        switch (name) {
            case IMAGE_OUTPUT: return changesBands()
            case 'COLLECTION_MOSAIC': return getAvailableBands(recipe, parameters.period, parameters.mosaicType)
            default: return undefined
        }
    }
}

const changesBands = () => {
    return {
        confidence: {dataType: typeFloat},
        difference: {dataType: typeFloat},
        detection_count: {dataType: typeFloat},
        monitoring_observation_count: {dataType: typeFloat},
        calibration_observation_count: {dataType: typeFloat},
        last_stable_date: {dataType: typeFloat},
        first_detection_date: {dataType: typeFloat},
        confirmation_date: {dataType: typeFloat},
        last_detection_date: {dataType: typeFloat}
    }
}

// A mosaic mode draws the mosaic Earth Engine builds around the monitoring dates, so the bands offered are
// read from the same projection the executor builds it from. A recipe that states no period yet has no such
// mosaic, and another recipe reading this one as a source is answered with nothing rather than an error.
const mosaicBands = (recipe, visualizationType, mosaicType) => {
    if (!hasMonitoringDates(recipe.model)) {
        return {}
    }
    const mosaic = mosaicRecipe({model: recipe.model, period: visualizationType, mosaicType})
    const bands = mosaic && MOSAIC_BANDS[mosaic.type]
    return bands ? bands(mosaic) : {}
}

export const getGroupedBandOptions = () => {
    const toOption = band => ({value: band, label: band})
    return [
        [
            toOption('confidence'),
            toOption('difference'),
            toOption('detection_count')
        ],
        [
            toOption('last_stable_date'),
            toOption('first_detection_date'),
            toOption('confirmation_date'),
            toOption('last_detection_date')
        ],
        [
            toOption('monitoring_observation_count'),
            toOption('calibration_observation_count'),
        ]
    ]
}
