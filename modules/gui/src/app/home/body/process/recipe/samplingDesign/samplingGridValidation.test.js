import {describe, expect, it} from 'vitest'

import {deriveStratificationGrid, isStratificationTransformActive, isValidGridScale, stratificationGridState, stratificationScaleDefault} from './samplingGridValidation'

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

// The transform stays active while the entered Scale AGREES with the derived metre size. Typing the number the
// placeholder just showed must not silently degrade the image's own grid to a resampled one.
describe('isStratificationTransformActive', () => {
    const derived = {crs: 'EPSG:4326', crsTransform: [8.983152841195215e-5, 0, 21.8, 0, -8.983152841195215e-5, 22.2], pixelSizeMetres: 10}

    it('is active when Scale is blank', () => {
        expect(isStratificationTransformActive({derived, crs: 'EPSG:4326', scale: ''})).toBe(true)
        expect(isStratificationTransformActive({derived, crs: 'EPSG:4326', scale: undefined})).toBe(true)
    })

    it('stays active when the entered Scale equals the derived metre size', () => {
        expect(isStratificationTransformActive({derived, crs: 'EPSG:4326', scale: '10'})).toBe(true)
        expect(isStratificationTransformActive({derived, crs: 'EPSG:4326', scale: 10})).toBe(true)
    })

    it('stays active when the entered Scale rounds to the derived size', () => {
        expect(isStratificationTransformActive({derived, crs: 'EPSG:4326', scale: '9.99999999'})).toBe(true)
    })

    it('goes inactive when the entered Scale differs', () => {
        expect(isStratificationTransformActive({derived, crs: 'EPSG:4326', scale: '30'})).toBe(false)
        expect(isStratificationTransformActive({derived, crs: 'EPSG:4326', scale: '9.5'})).toBe(false)
    })

    it('goes inactive when the CRS no longer matches the derived one', () => {
        expect(isStratificationTransformActive({derived, crs: 'EPSG:32636', scale: ''})).toBe(false)
    })

    it('becomes active again when the CRS is edited back', () => {
        expect(isStratificationTransformActive({derived, crs: 'EPSG:4326', scale: ''})).toBe(true)
    })

    it('is inactive when nothing was derived', () => {
        expect(isStratificationTransformActive({derived: null, crs: 'EPSG:4326', scale: ''})).toBe(false)
    })
})

// The panel's grid decision. Six cases from the packet, plus the no-derived-grid case.
describe('stratificationGridState', () => {
    const transform = [8.983152841195215e-5, 0, 21.8, 0, -8.983152841195215e-5, 22.2]
    const derived = {crs: 'EPSG:4326', crsTransform: transform, pixelSizeMetres: 10}

    it('blank Scale with a derived grid carries the transform and makes Scale optional', () => {
        expect(stratificationGridState({derived, crs: 'EPSG:4326', scale: ''}))
            .toEqual({crsTransform: transform, scaleRequired: false, mode: 'imageGrid', placeholder: 10})
    })

    it('Scale EQUAL to the derived metre size also carries the transform', () => {
        expect(stratificationGridState({derived, crs: 'EPSG:4326', scale: '10'}).crsTransform).toEqual(transform)
        expect(stratificationGridState({derived, crs: 'EPSG:4326', scale: '10'}).mode).toBe('imageGrid')
    })

    it('a differing Scale drops the transform and reports resampling', () => {
        const state = stratificationGridState({derived, crs: 'EPSG:4326', scale: '30'})
        expect(state.crsTransform).toBeNull()
        expect(state.mode).toBe('resampled')
        expect(state.scaleRequired).toBe(true)
    })

    it('clearing Scale restores the transform', () => {
        expect(stratificationGridState({derived, crs: 'EPSG:4326', scale: ''}).crsTransform).toEqual(transform)
    })

    it('editing the CRS away from the derived one clears the transform and requires Scale', () => {
        const state = stratificationGridState({derived, crs: 'EPSG:32636', scale: ''})
        expect(state.crsTransform).toBeNull()
        expect(state.scaleRequired).toBe(true)
        expect(state.mode).toBe('resampled')
    })

    it('no derived grid leaves Scale required with no placeholder and no mode text', () => {
        expect(stratificationGridState({derived: null, crs: 'EPSG:4326', scale: ''}))
            .toEqual({crsTransform: null, scaleRequired: true, mode: 'none', placeholder: null})
    })
})

describe('stratificationScaleDefault', () => {
    it('gives a recipe a concrete default, since it has no source grid to read', () => {
        expect(stratificationScaleDefault('RECIPE')).toBe('30')
    })

    // The failure mode that would not announce itself: auto-filling Scale destroys blank-means-image-grid while
    // every other test still passes, because the model looks valid.
    it('leaves an asset BLANK, so a derived grid is not overwritten', () => {
        expect(stratificationScaleDefault('ASSET')).toBeNull()
        expect(stratificationScaleDefault(undefined)).toBeNull()
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
