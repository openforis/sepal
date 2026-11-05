import Papa from 'papaparse'
import {describe, expect, it} from 'vitest'

import {pixelChartCsv} from './pixelChartCsv'

describe('a pixel chart CSV', () => {
    it('names the columns in their fixed order, with the band and pixel on every row', () => {
        const csv = pixelChartCsv({band: 'ndvi', latLng: PIXEL, records: [observation(JAN_1, 0.5), model(JAN_1, 0.4)]})

        expect(parse(csv)).toEqual([
            COLUMNS,
            ['ndvi', '12.5', '-3.25', '2020-01-01T00:00:00.000Z', '', 'observation', '0.5', '', '', '', '', ''],
            ['ndvi', '12.5', '-3.25', '2020-01-01T00:00:00.000Z', '', 'model', '0.4', '0.1', '0.30000000000000004', '0.5', 'fitted', '']
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

        const rows = parse(pixelChartCsv({band: 'ndvi', latLng: PIXEL, records})).slice(1)

        expect(rows.map(row => [row[TIMESTAMP], row[SERIES], row[VALUE]])).toEqual([
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

        const rows = parse(pixelChartCsv({band: 'ndvi', latLng: PIXEL, records})).slice(1)

        expect(rows.map(row => row.slice(VALUE, METHOD + 1))).toEqual([
            ['0', '0', '0', '0', 'fitted'],
            ['-0.25', '', '-0.5', '0', 'fitted'],
            ['', '', '', '', ''],
            ['', '', '', '', 'masked']
        ])
    })

    it('gives annual rows their year and no timestamp, with vertex flags only where they are given', () => {
        const records = [
            {series: 'observation', year: 2001, value: 20},
            {series: 'model', year: 2000, value: 11, method: 'fitted', vertex: true},
            {series: 'model', year: 2001, value: 21, method: 'fitted', vertex: false}
        ]

        const rows = parse(pixelChartCsv({band: 'nbr', latLng: PIXEL, records})).slice(1)

        expect(rows.map(row => [row[TIMESTAMP], row[YEAR], row[SERIES], row[VALUE], row[VERTEX]])).toEqual([
            ['', '2000', 'model', '11', 'true'],
            ['', '2001', 'observation', '20', ''],
            ['', '2001', 'model', '21', 'false']
        ])
    })

    it('quotes a band name that needs it and keeps its Unicode', () => {
        const band = 'Søndre "skog", β\nlinje'

        const csv = pixelChartCsv({band, latLng: PIXEL, records: [observation(JAN_1, 1)]})

        expect(csv).toContain('"Søndre ""skog"", β\nlinje"')
        expect(parse(csv)[1][0]).toBe(band)
    })

    it('keeps the full precision of values and coordinates', () => {
        const csv = pixelChartCsv({
            band: 'ndvi',
            latLng: {lat: 59.91386812345679, lng: 10.752245987654321},
            records: [observation(JAN_1 + 123, 0.12345678901234568), observation(JAN_1, 1e-7)]
        })

        expect(parse(csv)[1].slice(1, VALUE + 1)).toEqual(['59.91386812345679', '10.752245987654321', '2020-01-01T00:00:00.000Z', '', 'observation', '1e-7'])
        expect(parse(csv)[2][TIMESTAMP]).toBe('2020-01-01T00:00:00.123Z')
        expect(parse(csv)[2][VALUE]).toBe('0.12345678901234568')
    })
})

const COLUMNS = ['band', 'latitude', 'longitude', 'timestamp', 'year', 'series', 'value', 'rmse', 'lower', 'upper', 'model_method', 'is_vertex']
const [TIMESTAMP, YEAR, SERIES, VALUE, METHOD, VERTEX] = ['timestamp', 'year', 'series', 'value', 'model_method', 'is_vertex']
    .map(column => COLUMNS.indexOf(column))

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
