import {ALERT_BANDS} from '#sepal/recipe/bayts/alertBands'
import {IMAGE_OUTPUT} from '#sepal/recipe/output/product'
import {POINT_IN_TIME, RADAR_MOSAIC_BANDS} from '#sepal/recipe/type/radarMosaic'
import {radarBandTable} from '~/app/home/body/process/recipe/radarMosaic/bands'

const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

const ALERT_BAND_TYPES = {flag: typeInt, flag_orbit: typeInt}

// How the alert bands are shown; which of them exist is the declaration's to say.
const alertBands = () =>
    Object.fromEntries(
        ALERT_BANDS.map(name => [name, {dataType: ALERT_BAND_TYPES[name] || typeFloat}])
    )

export const bandPresentation = (_recipe, {name} = {}) =>
    name === IMAGE_OUTPUT ? alertBands() : {}

const POSITIONS = ['first', 'last']

// The alerts are the output; a layer may instead show the first or last radar observation they were detected in,
// which has not yet been declared and is answered here: the point-in-time Radar Mosaic Earth Engine builds around
// that date, named by its shared schema.
export const mapProducts = {
    defaults: {visualizationType: 'alerts', previouslyConfirmed: 'exclude', minConfidence: 'high'},
    productOf: ({visualizationType}) => {
        if (visualizationType === 'alerts') {
            return {name: IMAGE_OUTPUT}
        }
        return POSITIONS.includes(visualizationType)
            ? {name: 'RADAR_OBSERVATION', parameters: {position: visualizationType}}
            : null
    },
    bands: (_recipe, {name}) =>
        name === 'RADAR_OBSERVATION' ? radarBandTable(RADAR_MOSAIC_BANDS[POINT_IN_TIME]) : undefined
}

// The groups Retrieve offers the alert bands in.
export const groupedBandPresentation = () => {
    const presentation = alertBands()
    const toOption = band => ({value: band, label: band, ...presentation[band]})
    return [
        ['non_forest_probability', 'change_probability', 'flag', 'flag_orbit'].map(toOption),
        ['first_detection_date', 'confirmation_date'].map(toOption)
    ]
}
