import {scene} from './landsat.js'

describe('scene', () => {
    test('keeps a cloud-free scene reported with numeric values', () => {
        const result = scene(stacScene({cloudCover: 0}))

        expect(result).toMatchObject({id: stacScene().id, cloudCover: 0})
    })

    test('keeps a cloud-free scene reported with string values', () => {
        const result = scene(csvScene({cloudCover: '0.00'}))

        expect(result).toMatchObject({id: csvScene().id, cloudCover: 0})
    })

    test.each([undefined, null, ''])('rejects a scene with cloud cover %p', cloudCover => {
        expect(scene(stacScene({cloudCover}))).toBeNull()
    })
})

const stacScene = (overrides = {}) => ({
    id: 'LC08_L2SP_123045_20260901_20260910_02_T1',
    dataset: 'LANDSAT_8',
    wrsPath: 123,
    wrsRow: 45,
    acquiredTimestamp: '2026-09-01T03:12:45.000Z',
    cloudCover: 12.5,
    sunAzimuth: 130.2,
    sunElevation: 55.1,
    ...overrides
})

const csvScene = (overrides = {}) => ({
    ...stacScene(),
    wrsPath: '123',
    wrsRow: '045',
    cloudCover: '12.50',
    sunAzimuth: '130.20',
    sunElevation: '55.10',
    ...overrides
})
