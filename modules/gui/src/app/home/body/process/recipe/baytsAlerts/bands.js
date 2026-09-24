import {ALERT_BANDS} from '#sepal/recipe/bayts/alertBands'
import {getAvailableBands as radarBands} from '~/app/home/body/process/recipe/radarMosaic/bands'

import {IMAGE_OUTPUT} from '../legacyOutput'

const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

const ALERT_BAND_TYPES = {flag: typeInt, flag_orbit: typeInt}

export const getAvailableBands = (recipe, visualizationType) => {
    return !visualizationType || visualizationType === 'alerts'
        ? alertsBands()
        : radarBands(recipe)
}

const POSITIONS = ['first', 'last']

// The alerts are the output; a layer may instead show the first or last radar observation they were detected in.
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
    bands: (recipe, {name, parameters}) => {
        switch (name) {
            case IMAGE_OUTPUT: return alertsBands()
            case 'RADAR_OBSERVATION': return getAvailableBands(recipe, parameters.position)
            default: return undefined
        }
    }
}

// The bands of the alert product, each with the data type it is written as.
export const alertsBands = () =>
    Object.fromEntries(
        ALERT_BANDS.map(name => [name, {dataType: ALERT_BAND_TYPES[name] || typeFloat}])
    )

export const getGroupedBandOptions = () => {
    const toOption = band => ({value: band, label: band})
    return [
        ['non_forest_probability', 'change_probability', 'flag', 'flag_orbit'].map(toOption),
        ['first_detection_date', 'confirmation_date'].map(toOption)
    ]
}
