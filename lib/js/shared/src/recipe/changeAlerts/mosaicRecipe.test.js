import {mosaicRecipe} from './mosaicRecipe.js'

// A latest mosaic and a median one are different images, and for radar a different schema. Each source type
// expresses that differently, which is what a consumer reading this projection depends on.
describe('what a latest mosaic changes', () => {
    it('favours the end of the season for optical, which composites the whole period either way', () => {
        expect(filtersOf(opticalMosaic('monitoring', 'latest'))).toEqual([{type: 'DAY_OF_YEAR', percentile: 100}])
        expect(filtersOf(opticalMosaic('monitoring', 'median'))).toEqual([{type: 'DAY_OF_YEAR', percentile: 0}])
    })

    it('makes radar a point in time rather than a scan of the period', () => {
        expect(radarMosaic('monitoring', 'latest').model.dates)
            .toEqual({targetDate: '2024-06-15', fromDate: undefined, toDate: undefined})
        expect(radarMosaic('monitoring', 'median').model.dates)
            .toEqual({targetDate: undefined, fromDate: '2024-04-15', toDate: '2024-06-15'})
    })

    it('adds a target date to Planet, which keeps the period either way', () => {
        expect(planetMosaic('monitoring', 'latest').model.dates.targetDate).toBe('2024-06-15')
        expect(planetMosaic('monitoring', 'median').model.dates.targetDate).toBeUndefined()
        expect(planetMosaic('monitoring', 'median').model.dates.fromDate).toBe('2024-04-15')
    })
})

// The calibration period runs from the calibration start to where monitoring begins. Each source type states
// it in a different field, and naming the monitoring period there instead is the mistake worth catching.
describe('the calibration period', () => {
    it('is the season an optical mosaic composites over', () => {
        expect(opticalMosaic('calibration', 'median').model.dates)
            .toMatchObject({targetDate: '2024-04-15', seasonStart: '2024-01-15', seasonEnd: '2024-04-15'})
    })

    it('is what a radar mosaic scans, and where a latest one stands', () => {
        expect(radarMosaic('calibration', 'median').model.dates)
            .toEqual({targetDate: undefined, fromDate: '2024-01-15', toDate: '2024-04-15'})
        expect(radarMosaic('calibration', 'latest').model.dates.targetDate).toBe('2024-04-15')
    })

    it('is the interval a Planet mosaic selects within', () => {
        expect(planetMosaic('calibration', 'median').model.dates)
            .toMatchObject({fromDate: '2024-01-15', toDate: '2024-04-15'})
        expect(planetMosaic('calibration', 'latest').model.dates.targetDate).toBe('2024-04-15')
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
