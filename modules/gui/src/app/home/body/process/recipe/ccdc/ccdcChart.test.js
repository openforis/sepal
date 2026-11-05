import {afterEach, describe, expect, it} from 'vitest'

import {ccdcChart, ccdcChartRows, ccdcExportRecords} from './ccdcChart'
import {toT} from './t'

// Two segments in Unix milliseconds (dateFormat 2): A fitted from day 5 to day 10, B from day 20 to day 25, charted
// from day 0 to day 30.

describe('the model of a CCDC chart', () => {
    it('is fitted within each segment, with that segment\'s RMSE either side', () => {
        const records = modelRecords(chartOf({gapStrategy: 'MASK'}))

        expect(onDays(records, 5, 9)).toEqual(days(5, 9).map(day => fitted(day, A)))
        expect(onDays(records, 20, 24)).toEqual(days(20, 24).map(day => fitted(day, B)))
    })

    it('is masked around and between segments, a masked date keeping its row with nothing measured', () => {
        const records = modelRecords(chartOf({gapStrategy: 'MASK'}))

        expect([...onDays(records, 0, 4), ...onDays(records, 10, 19), ...onDays(records, 25, 29)])
            .toEqual([...days(0, 4), ...days(10, 19), ...days(25, 29)].map(masked))
    })

    it('is interpolated between segments with no single segment\'s RMSE, its bounds those drawn', () => {
        const chart = chartOf({gapStrategy: 'INTERPOLATE'})

        const between = onDays(modelRecords(chart), 10, 19)

        expect(between.map(({method, rmse}) => ({method, rmse}))).toEqual(days(10, 19).map(() => ({method: 'interpolated', rmse: null})))
        expect(between.every(({value}) => value > A.intercept && value < B.intercept)).toBe(true)
        expect(between.map(({value, lower, upper}) => [value, upper - value, value - lower].map(round)))
            .toEqual(between.map(({timestamp}) => drawnModel(chart, timestamp)).map(([value, uncertainty]) => [value, uncertainty, uncertainty].map(round)))
    })

    it('is extrapolated from the closest segment for the days allowed, with that segment\'s RMSE', () => {
        const records = modelRecords(chartOf({gapStrategy: 'EXTRAPOLATE', extrapolateSegment: 'CLOSEST', extrapolateMaxDays: 3}))

        expect(onDays(records, 10, 19)).toEqual([
            ...days(10, 13).map(day => extrapolated(day, A)),
            ...days(14, 16).map(masked),
            ...days(17, 19).map(day => extrapolated(day, B))
        ])
    })

    it('extrapolates before the first segment and after the last from the one segment there', () => {
        const records = modelRecords(chartOf({gapStrategy: 'EXTRAPOLATE', extrapolateSegment: 'CLOSEST', extrapolateMaxDays: 3}))

        expect([...onDays(records, 0, 4), ...onDays(records, 25, 29)]).toEqual([
            ...days(0, 1).map(masked),
            ...days(2, 4).map(day => extrapolated(day, A)),
            ...days(25, 28).map(day => extrapolated(day, B)),
            masked(29)
        ])
    })

    it.each([
        ['interpolated', {gapStrategy: 'INTERPOLATE'}, [0, 4]],
        ['extrapolated from a previous segment', {gapStrategy: 'EXTRAPOLATE', extrapolateSegment: 'PREVIOUS', extrapolateMaxDays: 30}, [0, 4]],
        ['extrapolated from a next segment', {gapStrategy: 'EXTRAPOLATE', extrapolateSegment: 'NEXT', extrapolateMaxDays: 30}, [25, 29]]
    ])('is masked where it would be %s that is not there', (_kind, options, [from, to]) => {
        expect(onDays(modelRecords(chartOf(options)), from, to)).toEqual(days(from, to).map(masked))
    })

    it('has the bounds drawn wherever a value is drawn, and none where nothing is', () => {
        for (const options of [{gapStrategy: 'MASK'}, {gapStrategy: 'INTERPOLATE'}, {gapStrategy: 'EXTRAPOLATE', extrapolateMaxDays: 3}]) {
            const chart = chartOf(options)

            expect(modelRecords(chart).map(({value, lower, upper}) => value === null ? null : [value, upper - value, value - lower].map(round)))
                .toEqual(ccdcChartRows(chart).map(([, , drawn]) => Array.isArray(drawn) ? [drawn[0], drawn[1], drawn[1]].map(round) : null))
        }
    })

    it('keeps zero and negative values and a zero RMSE', () => {
        const flat = {intercept: 0, rmse: 0}
        const falling = {intercept: -0.5, rmse: 0.25}
        const records = modelRecords(chartOf({gapStrategy: 'MASK', segments: segmentsOf([5, 10, flat], [20, 25, falling])}))

        expect(onDays(records, 5, 5)).toEqual([fitted(5, flat)])
        expect(onDays(records, 20, 20)).toEqual([{...fitted(20, falling), lower: -0.75, upper: -0.25}])
    })

    it.each([
        ['Pacific/Kiritimati', '2019-12-31T10:00:00.000Z'],
        ['America/Los_Angeles', '2020-01-01T08:00:00.000Z']
    ])('is evaluated in %s at the instant its date is exported with, local midnight, over a leap day', (timezone, firstMidnight) => {
        inTimezone(timezone)
        const sloped = segmentsOf([2020, 2021, {intercept: 0.1, slope: 0.5, rmse: 0.01}])
        const chart = ccdcChart({band: 'ndvi', latLng: PIXEL, dateFormat: 1, segments: sloped})

        const records = modelRecords(chart)

        expect(records).toHaveLength(366)
        expect(records[0].timestamp.toISOString()).toBe(firstMidnight)
        expect(records.every(({timestamp}) => timestamp.getHours() === 0 && timestamp.getMinutes() === 0)).toBe(true)
        expect(records.map(({timestamp}) => [timestamp.getMonth(), timestamp.getDate()])).toContainEqual([1, 29])
        expect(records.map(({value}) => value)).toEqual(records.map(({timestamp}) => 0.1 + 0.5 * toT(timestamp, 1)))
        expect(records.map(({timestamp, value}) => [timestamp.getTime(), value]))
            .toEqual(ccdcChartRows(chart).map(([date, , [value]]) => [date.getTime(), value]))
    })
})

describe('the observations of a CCDC chart', () => {
    it('draws asynchronously returned observations in time order without changing the response or losing duplicates', () => {
        const read = Object.freeze([at(20, 10), at(1, 12), at(10, 10), at(1, 12)]
            .map((time, index) => Object.freeze(feature(time, index))))
        const chart = ccdcChart({band: 'ndvi', latLng: PIXEL, observations: {features: read}})

        expect(ccdcChartRows(chart).map(([date, [value]]) => [date.getTime(), value])).toEqual([
            [at(1, 12), 1], [at(1, 12), 3], [at(10, 10), 2], [at(20, 10), 0]
        ])
        expect(chart.observations.features).toBe(read)
        expect(observationRecords(chart).map(({timestamp, value}) => [timestamp.getTime(), value]))
            .toEqual(read.map(({properties: {date, value}}) => [date.value, value]))
    })

    it('are exported as read, each at its own instant, though the drawing shows one a day', () => {
        const read = [at(6, 15), at(6, 10), at(6, 10), at(-1, 12)].map((time, index) => feature(time, index))
        const chart = chartOf({gapStrategy: 'MASK', observations: {features: read}})

        expect(observationRecords(chart)).toEqual(read.map(({properties: {date, value}}) => ({
            series: 'observation', timestamp: new Date(date.value), value
        })))
        expect(ccdcChartRows(chart).filter(([, observation]) => observation)).toHaveLength(1)
    })

    it('leave a missing value blank, keeping zero and negative ones', () => {
        const chart = ccdcChart({
            band: 'ndvi', latLng: PIXEL, startDate: new Date(day(0)), endDate: new Date(day(30)),
            observations: {features: [feature(day(1), 0), feature(day(2), -0.5), feature(day(3), null)]}
        })

        expect(observationRecords(chart).map(({value}) => value)).toEqual([0, -0.5, null])
    })

    it('are all a chart without segments exports, and none means it has nothing to export', () => {
        const observed = ccdcChart({band: 'ndvi', latLng: PIXEL, observations: {features: [feature(day(1), 0.5)]}})
        const unobserved = ccdcChart({band: 'ndvi', latLng: PIXEL, observations: {features: []}})

        expect(ccdcExportRecords(observed).map(({series}) => series)).toEqual(['observation'])
        expect(observed.empty).toBe(false)
        expect(unobserved.empty).toBe(true)
    })

    it('alone are exported where the pixel has no segments', () => {
        const chart = chartOf({gapStrategy: 'MASK', segments: segmentsOf(), observations: {features: [feature(day(1), 0.5)]}})

        expect(ccdcExportRecords(chart).map(({series}) => series)).toEqual(['observation'])
        expect(chartOf({gapStrategy: 'MASK', segments: segmentsOf(), observations: {features: []}}).empty).toBe(true)
    })
})

const DAY = 24 * 3600000
const START = Date.UTC(2020, 0, 1)
const PIXEL = {lat: 1, lng: 2}
const A = {intercept: 1, rmse: 0.1}
const B = {intercept: 2, rmse: 0.2}
const ORIGINAL_TIMEZONE = process.env.TZ

afterEach(() => {
    process.env.TZ = ORIGINAL_TIMEZONE
})

const inTimezone = timezone => {
    process.env.TZ = timezone
}

function day(n) {
    return START + n * DAY
}

function at(n, hour) {
    return day(n) + hour * 3600000
}

function days(from, to) {
    return Array.from({length: to - from + 1}, (_, index) => from + index)
}

// Each segment as [start, end, {intercept, slope, rmse}]: in days from the chart's start for dateFormat 2, in years for
// dateFormat 1.
function segmentsOf(...segments) {
    const time = value => value >= 1000 ? value : day(value)
    return {
        tStart: segments.map(([start]) => time(start)),
        tEnd: segments.map(([, end]) => time(end)),
        tBreak: segments.map(() => 0),
        changeProb: segments.map(() => 0),
        numObs: segments.map(() => 10),
        ndvi_coefs: segments.map(([, , {intercept, slope = 0}]) => [intercept, slope, 0, 0, 0, 0, 0, 0]),
        ndvi_rmse: segments.map(([, , {rmse}]) => rmse),
        ndvi_magnitude: segments.map(() => 0)
    }
}

function chartOf({segments = segmentsOf([5, 10, A], [20, 25, B]), observations, ...options}) {
    return ccdcChart({
        band: 'ndvi', latLng: PIXEL, dateFormat: 2, startDate: new Date(day(0)), endDate: new Date(day(30)),
        segments, observations, ...options
    })
}

function feature(time, value) {
    return {properties: {date: {value: time}, value}}
}

const modelRecords = chart => ccdcExportRecords(chart).filter(({series}) => series === 'model')

const observationRecords = chart => ccdcExportRecords(chart).filter(({series}) => series === 'observation')

const onDays = (records, from, to) => records.filter(({timestamp}) => timestamp >= day(from) && timestamp <= day(to))

const drawnModel = (chart, timestamp) => ccdcChartRows(chart).find(([date]) => date.getTime() === timestamp.getTime())[2]

const fitted = (n, {intercept, rmse}) =>
    ({series: 'model', timestamp: new Date(day(n)), value: intercept, rmse, lower: intercept - rmse, upper: intercept + rmse, method: 'fitted'})

const extrapolated = (n, segment) => ({...fitted(n, segment), method: 'extrapolated'})

const masked = n =>
    ({series: 'model', timestamp: new Date(day(n)), value: null, rmse: null, lower: null, upper: null, method: 'masked'})

const round = value => Math.round(value * 1e9) / 1e9
