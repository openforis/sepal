import Papa from 'papaparse'
import {describe, expect, it} from 'vitest'

import {pixelChartCsv} from './pixelChartCsv'

describe('a pixel chart CSV', () => {
    it('names the applicable columns in their fixed order, with the band and pixel on every row', () => {
        const csv = pixelChartCsv({band: 'ndvi', latLng: PIXEL, records: [observation(JAN_1, 0.5), model(JAN_1, 0.4)]})

        expect(parse(csv)).toEqual([
            MIXED_COLUMNS,
            ['ndvi', '12.5', '-3.25', '2020-01-01T00:00:00.000Z', 'observation', '0.5', '', '', '', ''],
            ['ndvi', '12.5', '-3.25', '2020-01-01T00:00:00.000Z', 'model', '0.4', '0.1', '0.30000000000000004', '0.5', 'fitted']
        ])
    })

    it('omits model, annual and series columns from observations alone, even with missing values', () => {
        const csv = pixelChartCsv({band: 'ndvi', latLng: PIXEL, records: [observation(JAN_1, null)]})

        expect(parse(csv)).toEqual([
            ['band', 'latitude', 'longitude', 'timestamp', 'value'],
            ['ndvi', '12.5', '-3.25', '2020-01-01T00:00:00.000Z', '']
        ])
    })

    it('keeps applicable model columns when every value is masked, without a redundant series column', () => {
        const csv = pixelChartCsv({band: 'ndvi', latLng: PIXEL, records: [
            {...model(JAN_1, null), rmse: null, lower: null, upper: null, method: 'masked'}
        ]})

        expect(parse(csv)).toEqual([
            ['band', 'latitude', 'longitude', 'timestamp', 'value', 'rmse', 'lower', 'upper', 'model_method'],
            ['ndvi', '12.5', '-3.25', '2020-01-01T00:00:00.000Z', '', '', '', '', 'masked']
        ])
    })

    it('orders rows in time, an observation before the model at the same instant, keeping duplicate observations', () => {
        const records = [
            model(JAN_2, 5),
            observation(JAN_2 + HOUR, 6),
            observation(JAN_1 + 10 * HOUR, 3),
            model(JAN_1, 2),
            observation(JAN_1 + 10 * HOUR, 4),
            observation(JAN_1, 1)
        ]

        const rows = objects(pixelChartCsv({band: 'ndvi', latLng: PIXEL, records}))

        expect(rows.map(({timestamp, series, value}) => [timestamp, series, value])).toEqual([
            ['2020-01-01T00:00:00.000Z', 'observation', '1'],
            ['2020-01-01T00:00:00.000Z', 'model', '2'],
            ['2020-01-01T10:00:00.000Z', 'observation', '3'],
            ['2020-01-01T10:00:00.000Z', 'observation', '4'],
            ['2020-01-02T00:00:00.000Z', 'model', '5'],
            ['2020-01-02T01:00:00.000Z', 'observation', '6']
        ])
    })

    it('keeps zero and negative values, and leaves what is unavailable blank', () => {
        const records = [
            {...model(JAN_1, 0), rmse: 0, lower: 0, upper: 0},
            {...model(JAN_2, -0.25), rmse: null, lower: -0.5, upper: 0},
            {...model(JAN_3, NaN), rmse: NaN, lower: undefined, upper: Infinity, method: 'masked'},
            observation(JAN_3, null)
        ]

        const rows = objects(pixelChartCsv({band: 'ndvi', latLng: PIXEL, records}))

        expect(rows.map(({value, rmse, lower, upper, model_method}) => [value, rmse, lower, upper, model_method])).toEqual([
            ['0', '0', '0', '0', 'fitted'],
            ['-0.25', '', '-0.5', '0', 'fitted'],
            ['', '', '', '', ''],
            ['', '', '', '', 'masked']
        ])
    })

    it('gives annual rows their year and no timestamp, with vertex flags only where they are given', () => {
        const records = [
            {series: 'observation', year: 2001, value: 20},
            {series: 'model', year: 2000, value: 11, vertex: true},
            {series: 'model', year: 2001, value: 21, vertex: false}
        ]

        const csv = pixelChartCsv({band: 'nbr', latLng: PIXEL, records})
        const rows = objects(csv)

        expect(parse(csv)[0]).toEqual(['band', 'latitude', 'longitude', 'year', 'series', 'value', 'is_vertex'])
        expect(rows.map(({year, series, value, is_vertex}) => [year, series, value, is_vertex])).toEqual([
            ['2000', 'model', '11', 'true'],
            ['2001', 'observation', '20', ''],
            ['2001', 'model', '21', 'false']
        ])
    })

    it('quotes a band name that needs it and keeps its Unicode', () => {
        const band = 'Søndre "skog", β\nlinje'

        const csv = pixelChartCsv({band, latLng: PIXEL, records: [observation(JAN_1, 1)]})

        expect(csv).toContain('"Søndre ""skog"", β\nlinje"')
        expect(parse(csv)[1][0]).toBe(band)
    })

    it('keeps columns whose only supplied values are zero or false', () => {
        const csv = pixelChartCsv({band: 'nbr', latLng: PIXEL, records: [
            {series: 'observation', year: 2000, value: 0},
            {series: 'model', year: 2000, value: 0, vertex: false}
        ]})

        expect(parse(csv)).toEqual([
            ['band', 'latitude', 'longitude', 'year', 'series', 'value', 'is_vertex'],
            ['nbr', '12.5', '-3.25', '2000', 'observation', '0', ''],
            ['nbr', '12.5', '-3.25', '2000', 'model', '0', 'false']
        ])
    })

    it('keeps the full precision of values and coordinates', () => {
        const csv = pixelChartCsv({
            band: 'ndvi',
            latLng: {lat: 59.91386812345679, lng: 10.752245987654321},
            records: [observation(JAN_1 + 123, 0.12345678901234568), observation(JAN_1, 1e-7)]
        })

        expect(parse(csv)[1].slice(1)).toEqual(['59.91386812345679', '10.752245987654321', '2020-01-01T00:00:00.000Z', '1e-7'])
        expect(objects(csv)[1].timestamp).toBe('2020-01-01T00:00:00.123Z')
        expect(objects(csv)[1].value).toBe('0.12345678901234568')
    })
})

const MIXED_COLUMNS = ['band', 'latitude', 'longitude', 'timestamp', 'series', 'value', 'rmse', 'lower', 'upper', 'model_method']

const PIXEL = {lat: 12.5, lng: -3.25}
const HOUR = 3600000
const JAN_1 = Date.UTC(2020, 0, 1)
const JAN_2 = Date.UTC(2020, 0, 2)
const JAN_3 = Date.UTC(2020, 0, 3)

function observation(time, value) {
    return {series: 'observation', timestamp: new Date(time), value}
}

function model(time, value) {
    return {series: 'model', timestamp: new Date(time), value, rmse: 0.1, lower: value - 0.1, upper: value + 0.1, method: 'fitted'}
}

const parse = csv => Papa.parse(csv, {skipEmptyLines: true}).data
const objects = csv => Papa.parse(csv, {header: true, skipEmptyLines: true}).data
