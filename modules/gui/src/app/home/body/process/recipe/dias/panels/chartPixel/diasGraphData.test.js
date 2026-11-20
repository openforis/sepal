import {describe, expect, it} from 'vitest'

import {alertPeriod, diasExportRecords, diasGraphData, toDate} from './diasGraphData'

const SENTINEL_1 = 1
const LANDSAT = 2
const SENTINEL_2 = 3

describe('diasGraphData', () => {
    it('puts each DI in the column of the sensor that observed it', () => {
        const observation = {di: 4.2, source: SENTINEL_2, ydoy: 2026100}

        const [row] = diasGraphData({observations: [observation], threshold: 3})

        expect(row).toEqual([toDate(observation.ydoy), null, null, observation.di, null, 3])
    })

    it('orders observations by date, then by sensor on the same day', () => {
        const observations = [
            {di: 1, source: SENTINEL_2, ydoy: 2026120},
            {di: 2, source: LANDSAT, ydoy: 2026120},
            {di: 3, source: SENTINEL_1, ydoy: 2026101}
        ]

        const rows = diasGraphData({observations, threshold: 3})

        expect(rows.map(([date, s1, landsat, s2]) => [date, s1 ?? landsat ?? s2])).toEqual([
            [toDate(2026101), 3],
            [toDate(2026120), 2],
            [toDate(2026120), 1]
        ])
    })
})

describe('toDate', () => {
    it('reads a year and day of year', () => {
        expect(toDate(2026032)).toEqual(new Date(2026, 1, 1))
    })
})

describe('alertPeriod', () => {
    it('spans the calendar days of the first and the confirming observation', () => {
        const alert = {first_date: midday(2026, 200), confirming_date: midday(2026, 224)}

        expect(alertPeriod(alert)).toEqual({startDate: new Date(2026, 6, 19), endDate: new Date(2026, 7, 12)})
    })

    it('is absent when the pixel has no alert', () => {
        expect(alertPeriod({first_date: null, confirming_date: null, forest_mask: 1})).toBeNull()
    })
})

describe('the exported observations', () => {
    it('are one record per observation, on its day in UTC, named by its sensor', () => {
        const observations = [{di: 2.5, source: LANDSAT, ydoy: 2026032}, {di: -0.4, source: SENTINEL_1, ydoy: 2026033}]

        expect(diasExportRecords({observations})).toEqual([
            {series: 'observation', timestamp: new Date(Date.UTC(2026, 1, 1)), sensor: 'Landsat', value: 2.5},
            {series: 'observation', timestamp: new Date(Date.UTC(2026, 1, 2)), sensor: 'Sentinel-1', value: -0.4}
        ])
    })
})

// A day of a 365-day year as the alert bands date it: a fractional year at the middle of the day.
const midday = (year, dayOfYear) => year + (dayOfYear - 0.5) / 365
