import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {mosaicRecipe} from './mosaicRecipe.js'

// A latest mosaic and a median one are different images, and for radar a different schema. Each source type
// expresses that differently, which is what a consumer reading this projection depends on.
describe('what a latest mosaic changes', () => {
    it('favours the end of the season for optical, which composites the whole period either way', () => {
        assert.deepEqual(
            filtersOf(opticalMosaic('monitoring', 'latest')),
            [{type: 'DAY_OF_YEAR', percentile: 100}]
        )
        assert.deepEqual(
            filtersOf(opticalMosaic('monitoring', 'median')),
            [{type: 'DAY_OF_YEAR', percentile: 0}]
        )
    })

    it('makes radar a point in time rather than a scan of the period', () => {
        assert.deepEqual(
            radarMosaic('monitoring', 'latest').model.dates,
            {targetDate: '2024-06-15', fromDate: undefined, toDate: undefined}
        )
        assert.deepEqual(
            radarMosaic('monitoring', 'median').model.dates,
            {targetDate: undefined, fromDate: '2024-04-15', toDate: '2024-06-15'}
        )
    })

    it('adds a target date to Planet, which keeps the period either way', () => {
        assert.equal(planetMosaic('monitoring', 'latest').model.dates.targetDate, '2024-06-15')
        assert.equal(planetMosaic('monitoring', 'median').model.dates.targetDate, undefined)
        assert.equal(planetMosaic('monitoring', 'median').model.dates.fromDate, '2024-04-15')
    })
})

// The calibration period runs from the calibration start to where monitoring begins. Each source type states
// it in a different field, and naming the monitoring period there instead is the mistake worth catching.
describe('the calibration period', () => {
    it('is the season an optical mosaic composites over', () => {
        assert.partialDeepStrictEqual(
            opticalMosaic('calibration', 'median').model.dates,
            {targetDate: '2024-04-15', seasonStart: '2024-01-15', seasonEnd: '2024-04-15'}
        )
    })

    it('is what a radar mosaic scans, and where a latest one stands', () => {
        assert.deepEqual(
            radarMosaic('calibration', 'median').model.dates,
            {targetDate: undefined, fromDate: '2024-01-15', toDate: '2024-04-15'}
        )
        assert.equal(radarMosaic('calibration', 'latest').model.dates.targetDate, '2024-04-15')
    })

    it('is the interval a Planet mosaic selects within', () => {
        assert.partialDeepStrictEqual(
            planetMosaic('calibration', 'median').model.dates,
            {fromDate: '2024-01-15', toDate: '2024-04-15'}
        )
        assert.equal(planetMosaic('calibration', 'latest').model.dates.targetDate, '2024-04-15')
    })
})

// The mosaic is built over the dates the period states, in the year it states them, however early.
describe('a period in a year below 100', () => {
    it('is scanned in that year, from the calibration start to where monitoring begins', () => {
        const mosaic = mosaicRecipe({
            model: {
                date: {...DATE, monitoringEnd: '0099-03-31', monitoringDuration: 1, calibrationDuration: 1},
                sources: {dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}},
                options: {}
            },
            period: 'calibration',
            mosaicType: 'median'
        })

        assert.deepEqual(
            mosaic.model.dates,
            {targetDate: undefined, fromDate: '0099-01-28', toDate: '0099-02-28'}
        )
    })
})

const DATE = {
    monitoringEnd: '2024-06-15',
    monitoringDuration: 2,
    monitoringDurationUnit: 'months',
    calibrationDuration: 3,
    calibrationDurationUnit: 'months'
}

const filtersOf = mosaic => mosaic.model.compositeOptions.filters

const projection = sources => (period, mosaicType) => mosaicRecipe({
    model: {date: DATE, sources, options: {}},
    period,
    mosaicType
})

const opticalMosaic = projection({dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}})

const radarMosaic = projection({dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}})

const planetMosaic = projection({dataSetType: 'PLANET', dataSets: {PLANET: ['NICFI']}, assets: []})
