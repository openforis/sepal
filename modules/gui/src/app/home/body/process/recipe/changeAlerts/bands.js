import {hasMonitoringDates} from '#sepal/recipe/changeAlerts/monitoringDates'
import {mosaicRecipe} from '#sepal/recipe/changeAlerts/mosaicRecipe'
import {IMAGE_OUTPUT} from '#sepal/recipe/output/product'
import {CHANGE_ALERT_BANDS} from '#sepal/recipe/type/changeAlerts'
import {radarMosaicBands} from '#sepal/recipe/type/radarMosaic'
import {getAvailableBands as opticalBands} from '~/app/home/body/process/recipe/opticalMosaic/bands'
import {getAvailableBands as planetBands} from '~/app/home/body/process/recipe/planetMosaic/bands'
import {radarBandTable} from '~/app/home/body/process/recipe/radarMosaic/bands'

const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

// The counts are whole numbers of observations.
const CHANGE_BAND_TYPES = {
    detection_count: typeInt,
    monitoring_observation_count: typeInt,
    calibration_observation_count: typeInt
}

// How the change bands are shown; which of them exist is the declaration's to say.
const changeBands = () =>
    Object.fromEntries(
        CHANGE_ALERT_BANDS.map(({name}) => [name, {dataType: CHANGE_BAND_TYPES[name] || typeFloat}])
    )

export const bandPresentation = (_recipe, {name} = {}) =>
    name === IMAGE_OUTPUT ? changeBands() : {}

const PERIODS = ['monitoring', 'calibration']
const MOSAIC_TYPES = ['latest', 'median']

// The changes are the output; a layer may instead show the mosaic a period is compared on, which has not yet been
// declared and is answered here.
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
    bands: (recipe, {name, parameters}) =>
        name === 'COLLECTION_MOSAIC' ? mosaicBands(recipe, parameters) : undefined
}

// The groups Retrieve offers the change bands in.
export const groupedBandPresentation = () => {
    const presentation = changeBands()
    const toOption = band => ({value: band, label: band, ...presentation[band]})
    return [
        ['confidence', 'difference', 'detection_count'].map(toOption),
        ['last_stable_date', 'first_detection_date', 'confirmation_date', 'last_detection_date'].map(toOption),
        ['monitoring_observation_count', 'calibration_observation_count'].map(toOption)
    ]
}

// Which helper describes a mosaic, keyed by the recipe type its projection names. A radar mosaic is named by its
// shared declaration and presented by Radar Mosaic.
const MOSAIC_BANDS = {
    MOSAIC: opticalBands,
    RADAR_MOSAIC: mosaic => radarBandTable(radarMosaicBands(mosaic.model)),
    PLANET_MOSAIC: planetBands
}

// A mosaic mode draws the mosaic Earth Engine builds around the monitoring dates, so the bands offered are read from
// the same projection the executor builds it from. A recipe that states no period yet, or a data-set type no mosaic is
// defined for, has no such mosaic.
const mosaicBands = (recipe, {period, mosaicType}) => {
    if (!hasMonitoringDates(recipe.model)) {
        return {}
    }
    const mosaic = mosaicRecipe({model: recipe.model, period, mosaicType})
    const bands = mosaic && MOSAIC_BANDS[mosaic.type]
    return bands ? bands(mosaic) : {}
}
