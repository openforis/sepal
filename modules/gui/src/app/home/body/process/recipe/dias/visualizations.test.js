import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))

const {getPreSetVisualizations, SENSOR_LABELS, SENSOR_PALETTE} = await import('./visualizations')

describe('the sensor layers', () => {
    it('show the four sensors, whatever data sets are chosen', () => {
        const recipe = diasRecipe({LANDSAT: ['LANDSAT_9']})

        expect(sensorLayer(recipe)).toMatchObject({
            values: [1, 2, 3, 4],
            labels: [1, 2, 3, 4].map(sensor => SENSOR_LABELS[sensor]),
            palette: [1, 2, 3, 4].map(sensor => SENSOR_PALETTE[sensor])
        })
    })
})

const diasRecipe = dataSets => ({
    type: 'DIAS',
    model: {dates: {startDate: '2026-01-01', endDate: '2026-04-01'}, sources: {dataSets}}
})

const sensorLayer = recipe =>
    getPreSetVisualizations(recipe).find(({bands}) => bands[0] === 'first_sensor')
