import moment from 'moment'

import {normalize} from '~/app/home/map/visParams/visParams'
import {msg} from '~/translate'

import {bandLabel} from './bands'

const DATE_FORMAT = 'YYYY-MM-DD'

// By the id lib/js/ee/src/dias/diCollection.js gives each sensor (SOURCE_ID), in the colors the paper uses to distinguish
// them in its alert maps (Figure 4): Sentinel-1 teal, Landsat salmon, Sentinel-2 violet, Planet green.
export const SENSOR_PALETTE = {1: '#1CADE4', 2: '#FF6F61', 3: '#C77DFF', 4: '#6AA84F'}
export const SENSOR_LABELS = {1: 'Sentinel-1', 2: 'Landsat', 3: 'Sentinel-2', 4: 'Planet'}

const SENSORS = [1, 2, 3, 4]

// The middle of the day, as lib/js/ee/src/dias/alertConfirmation.js dates the alert bands.
const toFractionalYear = date => {
    const day = moment(date, DATE_FORMAT)
    const daysInYear = moment(day).endOf('year').dayOfYear()
    return day.year() + (day.dayOfYear() - 0.5) / daysInYear
}

export const getPreSetVisualizations = recipe =>
    Object.values(toVisualizations(recipe))

export const visualizationOptions = recipe => {
    const visualizations = toVisualizations(recipe)
    const toOptions = bands => bands
        .map(band => ({value: band, label: bandLabel(band), visParams: visualizations[band]}))
    return [
        {
            label: msg('process.dias.layers.imageLayer.sensors'),
            options: toOptions(['first_sensor', 'confirming_sensor'])
        },
        {
            label: msg('process.dias.layers.imageLayer.dates'),
            options: toOptions(['first_date', 'confirming_date'])
        },
        {
            label: msg('process.dias.layers.imageLayer.forestMask'),
            options: toOptions(['forest_mask'])
        }
    ]
}

const toVisualizations = recipe => {
    const {startDate, endDate} = recipe.model.dates
    const min = toFractionalYear(startDate)
    const max = toFractionalYear(endDate)
    const sensorVisParams = bands => normalize({
        type: 'categorical',
        bands,
        min: SENSORS[0],
        max: SENSORS[SENSORS.length - 1],
        values: SENSORS,
        labels: SENSORS.map(sensor => SENSOR_LABELS[sensor]),
        palette: SENSORS.map(sensor => SENSOR_PALETTE[sensor])
    })
    const dateVisParams = bands => normalize({
        type: 'continuous',
        bands,
        dataType: 'fractionalYears',
        min: [min],
        max: [max],
        palette: ['#000000', '#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']
    })
    // Always exactly 1 wherever the pixel counts as forest (masked out
    // elsewhere) - a plain grey so it reads as an extent overlay rather
    // than competing with the DI/alert layers. The map's own per-layer
    // opacity control is the intended way to make it semi-transparent.
    const forestMaskVisParams = bands => normalize({
        type: 'categorical',
        bands,
        values: [1],
        labels: [msg('process.dias.layers.imageLayer.forestMask')],
        palette: ['#808080']
    })
    return {
        first_sensor: sensorVisParams(['first_sensor']),
        confirming_sensor: sensorVisParams(['confirming_sensor']),
        first_date: dateVisParams(['first_date']),
        confirming_date: dateVisParams(['confirming_date']),
        forest_mask: forestMaskVisParams(['forest_mask'])
    }
}
