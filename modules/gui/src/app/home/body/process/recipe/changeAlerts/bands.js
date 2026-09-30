import {IMAGE_OUTPUT} from '#sepal/recipe/output/product'
import {CHANGE_ALERT_BANDS, COLLECTION_MOSAIC} from '#sepal/recipe/type/changeAlerts'
import {planetMosaicBands} from '#sepal/recipe/type/planetMosaic'
import {POINT_IN_TIME, RADAR_MOSAIC_BANDS, TIME_SCAN} from '#sepal/recipe/type/radarMosaic'
import {bandPresentation as opticalBandPresentation} from '~/app/home/body/process/recipe/opticalMosaic/bands'
import {planetBandTable} from '~/app/home/body/process/recipe/planetMosaic/bands'
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

// A collection mosaic is shown as the mosaic its sources build: optical, radar - either configuration - or Planet.
export const bandPresentation = (recipe, {name} = {}) => {
    switch (name) {
        case IMAGE_OUTPUT: return changeBands()
        case COLLECTION_MOSAIC: return MOSAIC_PRESENTATION[recipe.model?.sources?.dataSetType]?.() || {}
        default: return {}
    }
}

const MOSAIC_PRESENTATION = {
    OPTICAL: () => opticalBandPresentation(),
    RADAR: () => radarBandTable([...RADAR_MOSAIC_BANDS[POINT_IN_TIME], ...RADAR_MOSAIC_BANDS[TIME_SCAN]]),
    PLANET: () => planetBandTable(planetMosaicBands({}))
}

const PERIODS = ['monitoring', 'calibration']
const MOSAIC_TYPES = ['latest', 'median']

// The changes are the output; a layer may instead show the mosaic a period is compared on.
export const mapProducts = {
    defaults: {visualizationType: 'changes', mosaicType: 'latest'},
    productOf: ({visualizationType, mosaicType}) => {
        if (visualizationType === 'changes') {
            return {name: IMAGE_OUTPUT}
        }
        return PERIODS.includes(visualizationType) && MOSAIC_TYPES.includes(mosaicType)
            ? {name: COLLECTION_MOSAIC, parameters: {period: visualizationType, mosaicType}}
            : null
    }
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
