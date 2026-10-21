import {describe, expect, it} from 'vitest'

import {alertPeriod, diasGraphData, toDate} from './diasGraphData'

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
    it('spans the first to the confirming observation', () => {
        const alert = {first_ydoy: 2026200, confirming_ydoy: 2026224}

        expect(alertPeriod(alert)).toEqual({startDate: toDate(alert.first_ydoy), endDate: toDate(alert.confirming_ydoy)})
    })

    it('is absent when the pixel has no alert', () => {
        expect(alertPeriod({first_ydoy: null, confirming_ydoy: null, forest_mask: 1})).toBeNull()
    })
})
