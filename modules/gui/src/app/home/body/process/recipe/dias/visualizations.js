import moment from 'moment'

import {normalize} from '~/app/home/map/visParams/visParams'
import {msg} from '~/translate'

const DATE_FORMAT = 'YYYY-MM-DD'

// Same colors the paper uses to distinguish sensors in its alert maps (Figure 4):
// Sentinel-1 teal, Landsat salmon, Sentinel-2 violet, PlanetScope green.
export const SENSOR_PALETTE = ['#000000', '#1CADE4', '#FF6F61', '#C77DFF', '#6AA84F']
export const SENSOR_LABELS = ['None', 'Sentinel-1', 'Landsat', 'Sentinel-2', 'PlanetScope']

const toYdoy = date => {
    const m = moment(date, DATE_FORMAT)
    return m.year() * 1000 + m.dayOfYear()
}

export const getPreSetVisualizations = recipe =>
    Object.values(toVisualizations(recipe))

export const visualizationOptions = recipe => {
    const visualizations = toVisualizations(recipe)
    const toOptions = bands => bands
        .map(band => ({value: band, label: band, visParams: visualizations[band]}))
    return [
        {
            label: msg('process.dias.layers.imageLayer.sensors'),
            options: toOptions(['first_sensor', 'confirming_sensor'])
        },
        {
            label: msg('process.dias.layers.imageLayer.dates'),
            options: toOptions(['first_ydoy', 'confirming_ydoy'])
        },
        {
            label: msg('process.dias.layers.imageLayer.forestMask'),
            options: toOptions(['forest_mask'])
        }
    ]
}

const toVisualizations = recipe => {
    const {startDate, endDate} = recipe.model.dates
    const min = toYdoy(startDate)
    const max = toYdoy(endDate)
    const sensorVisParams = bands => normalize({
        type: 'categorical',
        bands,
        min: 0,
        max: 4,
        values: [0, 1, 2, 3, 4],
        labels: SENSOR_LABELS,
        palette: SENSOR_PALETTE
    })
    const dateVisParams = bands => normalize({
        type: 'continuous',
        bands,
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
        first_ydoy: dateVisParams(['first_ydoy']),
        confirming_ydoy: dateVisParams(['confirming_ydoy']),
        forest_mask: forestMaskVisParams(['forest_mask'])
    }
}
