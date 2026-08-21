import {describe, expect, it} from 'vitest'

import {deriveStratificationGrid, isValidGridScale, resolveStratificationGridState} from './samplingGridValidation'

describe('isValidGridScale', () => {
    it('accepts finite positive numbers and numeric strings', () => {
        expect(isValidGridScale(10)).toBe(true)
        expect(isValidGridScale('30')).toBe(true)
    })

    it('rejects empty, zero, negative and non-numeric scales', () => {
        expect(isValidGridScale('')).toBe(false)
        expect(isValidGridScale(undefined)).toBe(false)
        expect(isValidGridScale(0)).toBe(false)
        expect(isValidGridScale(-5)).toBe(false)
        expect(isValidGridScale('abc')).toBe(false)
    })
})

// The grid arrives in ONE shape from every source type - `crs` plus a six-element `crs_transform` per band -
// confirmed against a plain Image asset, a multi-band Image asset and an ImageCollection's first image.
describe('deriveStratificationGrid', () => {
    // Real Sentinel-2 shape: per-band grids on the SAME asset, 60 m and 10 m.
    const multiBand = {bands: [
        {id: 'B1', crs: 'EPSG:32633', crs_transform: [60, 0, 600000, 0, -60, 7000020]},
        {id: 'B4', crs: 'EPSG:32633', crs_transform: [10, 0, 600000, 0, -10, 7000020]}
    ]}

    it('takes the SELECTED band, not the first', () => {
        expect(deriveStratificationGrid(multiBand, 'B4'))
            .toEqual({crs: 'EPSG:32633', crsTransform: [10, 0, 600000, 0, -10, 7000020]})
    })

    it('takes the first band when it is the one selected', () => {
        expect(deriveStratificationGrid(multiBand, 'B1').crsTransform[0]).toBe(60)
    })

    it('rejects the identity transform a computed image reports, so it falls through to the default', () => {
        expect(deriveStratificationGrid(
            {bands: [{id: 'stratum', crs: 'EPSG:4326', crs_transform: [1, 0, 0, 0, 1, 0]}]},
            'stratum'
        )).toBeNull()
    })

    it('accepts a degree transform, which is axis-aligned despite its units', () => {
        const grid = deriveStratificationGrid(
            {bands: [{id: 'label', crs: 'EPSG:4326', crs_transform: [0.00008983152841195215, 0, 21.8, 0, -0.00008983152841195215, 22.2]}]},
            'label'
        )
        expect(grid.crs).toBe('EPSG:4326')
        expect(grid.crsTransform[0]).toBeCloseTo(0.00008983152841195215, 12)
    })

    it('returns null when the band is missing, has no transform, or metadata is absent', () => {
        expect(deriveStratificationGrid(multiBand, 'B9')).toBeNull()
        expect(deriveStratificationGrid({bands: [{id: 'B1', crs: 'EPSG:32633'}]}, 'B1')).toBeNull()
        expect(deriveStratificationGrid(undefined, 'B1')).toBeNull()
        expect(deriveStratificationGrid({}, 'B1')).toBeNull()
    })

    it('rejects a sheared or non-square band grid', () => {
        expect(deriveStratificationGrid({bands: [{id: 'B', crs: 'EPSG:32633', crs_transform: [10, 2, 0, 0, -10, 0]}]}, 'B')).toBeNull()
        expect(deriveStratificationGrid({bands: [{id: 'B', crs: 'EPSG:32633', crs_transform: [10, 0, 0, 0, -20, 0]}]}, 'B')).toBeNull()
    })
})

describe('deriveStratificationGrid on the collection path', () => {
    it('yields a real grid from a first member, not the identity', () => {
        const grid = deriveStratificationGrid({bands: [
            {id: 'B4', crs: 'EPSG:32633', crs_transform: [10, 0, 600000, 0, -10, 7000020], nominalScale: 10}
        ]}, 'B4')
        expect(grid).toEqual({crs: 'EPSG:32633', crsTransform: [10, 0, 600000, 0, -10, 7000020]})
    })

    it('falls back when handed the mosaic grid a regression would reintroduce', () => {
        expect(deriveStratificationGrid({bands: [
            {id: 'B4', crs: 'EPSG:4326', crs_transform: [1, 0, 0, 0, 1, 0], nominalScale: 111319.49}
        ]}, 'B4')).toBeNull()
    })

    it('accepts members whose transforms differ only by whole-tile translation', () => {
        const first = deriveStratificationGrid({bands: [{id: 'b', crs: 'EPSG:32633', crs_transform: [10, 0, 600000, 0, -10, 7000020]}]}, 'b')
        const second = deriveStratificationGrid({bands: [{id: 'b', crs: 'EPSG:32633', crs_transform: [10, 0, 300000, 0, -10, 6900000]}]}, 'b')
        expect(first.crsTransform[0]).toBe(second.crsTransform[0])
        expect(first.crsTransform[4]).toBe(second.crsTransform[4])
    })
})

// Blank means "use the effective value". Nothing is required; the model always carries a concrete resolved grid.
describe('resolveStratificationGridState', () => {
    const derived = {crs: 'EPSG:32633', crsTransform: [10, 0, 600000, 0, -10, 7000020], pixelSizeMetres: 10}

    it('blank CRS and blank Scale with a derived grid yields the transform', () => {
        expect(resolveStratificationGridState({derived, crs: '', scale: ''}))
            .toMatchObject({crs: 'EPSG:32633', scale: 10, crsTransform: derived.crsTransform, mode: 'imageGrid'})
    })

    it('an entered CRS with a blank Scale keeps the DERIVED pixel size, not the default', () => {
        const state = resolveStratificationGridState({derived, crs: 'EPSG:4326', scale: ''})
        expect(state.crs).toBe('EPSG:4326')
        expect(state.scale).toBe(10)
        expect(state.crsTransform).toBeNull()
        expect(state.mode).toBe('resampled')
    })

    it('an entered CRS equal to the derived one still yields the transform', () => {
        expect(resolveStratificationGridState({derived, crs: 'EPSG:32633', scale: ''}).crsTransform)
            .toEqual(derived.crsTransform)
    })

    it('a Scale equal to the derived pixel size still yields the transform', () => {
        expect(resolveStratificationGridState({derived, crs: '', scale: '10'}).crsTransform)
            .toEqual(derived.crsTransform)
        expect(resolveStratificationGridState({derived, crs: '', scale: '9.99999999'}).crsTransform)
            .toEqual(derived.crsTransform)
    })

    it('a differing Scale yields the entered scale and no transform', () => {
        expect(resolveStratificationGridState({derived, crs: '', scale: '30'}))
            .toMatchObject({crs: 'EPSG:32633', scale: 30, crsTransform: null, mode: 'resampled'})
    })

    it('nothing derived falls back to the defaults, with no transform', () => {
        expect(resolveStratificationGridState({derived: null, crs: '', scale: ''}))
            .toMatchObject({crs: 'EPSG:4326', scale: 30, crsTransform: null, mode: 'none'})
    })

    it('resolves concrete values while both user fields stay blank', () => {
        const state = resolveStratificationGridState({derived, crs: '', scale: ''})
        expect(Number.isFinite(state.scale)).toBe(true)
        expect(typeof state.crs).toBe('string')
        expect(state.crs).not.toBe('')
    })

    it('surfaces placeholders for both fields', () => {
        expect(resolveStratificationGridState({derived, crs: '', scale: ''}))
            .toMatchObject({placeholderCrs: 'EPSG:32633', placeholderScale: 10})
        expect(resolveStratificationGridState({derived: null, crs: '', scale: ''}))
            .toMatchObject({placeholderCrs: 'EPSG:4326', placeholderScale: 30})
    })
})
