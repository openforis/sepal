import {describe, expect, it} from 'vitest'

import {getDefaultModel} from './sampling/defaultModel'
import {
    effectiveProportionsScale,
    effectiveStratificationGrid,
    isValidGridScale,
    proportionsScaleFromBand,
    stratificationGridFromBand} from './samplingGridValidation'

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

// Selecting a band supplies the transient source defaults a blank override falls back to - it does not fill
// the visible fields. There is no derived-grid state and no transform: the band's own CRS and its nominal
// scale IN METRES are the whole answer, and Earth Engine decides later whether the design lands on the
// source's own pixel grid.
describe('stratificationGridFromBand', () => {
    // Real Sentinel-2 shape: per-band grids on the SAME asset, 60 m and 10 m.
    const bands = [
        {id: 'B1', crs: 'EPSG:32633', crs_transform: [60, 0, 600000, 0, -60, 7000020], nominalScale: 60},
        {id: 'B4', crs: 'EPSG:32633', crs_transform: [10, 0, 600000, 0, -10, 7000020], nominalScale: 10}
    ]

    it('takes the SELECTED band, not the first', () => {
        expect(stratificationGridFromBand(bands, 'B4')).toEqual({crs: 'EPSG:32633', scale: 10})
        expect(stratificationGridFromBand(bands, 'B1')).toEqual({crs: 'EPSG:32633', scale: 60})
    })

    // The Sudan land-cover band: 10 m pixels held in geographic coordinates. The metre scale is what is shown
    // and persisted; the degree transform the band also carries is not a grid definition.
    it('yields the geographic CRS with the metre scale', () => {
        expect(stratificationGridFromBand(
            [{id: 'label', crs: 'EPSG:4326', crs_transform: [0.0000898315, 0, 23.5, 0, -0.0000898315, 12.5], nominalScale: 10}],
            'label'
        )).toEqual({crs: 'EPSG:4326', scale: 10})
    })

    it('trims floating-point noise out of the displayed scale', () => {
        expect(stratificationGridFromBand([{id: 'b', crs: 'EPSG:4326', nominalScale: 9.999996837195955}], 'b').scale).toBe(10)
        expect(stratificationGridFromBand([{id: 'b', crs: 'EPSG:32636', nominalScale: 13.77}], 'b').scale).toBe(13.77)
    })

    it('falls back per field when the band reports no usable grid', () => {
        expect(stratificationGridFromBand([{id: 'b', crs: 'EPSG:32633'}], 'b')).toEqual({crs: 'EPSG:32633', scale: 30})
        expect(stratificationGridFromBand([{id: 'b', nominalScale: 10}], 'b')).toEqual({crs: 'EPSG:4326', scale: 10})
        expect(stratificationGridFromBand([{id: 'b', crs: 'EPSG:4326', nominalScale: 0}], 'b')).toEqual({crs: 'EPSG:4326', scale: 30})
    })

    // A computed image reports a degree-scale default rather than a real grid, so a recipe source has nothing
    // to derive from and takes the plain fallback.
    it('falls back entirely when there is no metadata for the band', () => {
        expect(stratificationGridFromBand(bands, 'B9')).toEqual({crs: 'EPSG:4326', scale: 30})
        expect(stratificationGridFromBand(undefined, 'B1')).toEqual({crs: 'EPSG:4326', scale: 30})
        expect(stratificationGridFromBand([], undefined)).toEqual({crs: 'EPSG:4326', scale: 30})
    })

    // One authority for what a new design starts as; a second copy of 30 here would drift from it silently.
    it('falls back to what a new recipe starts as', () => {
        const {crs, scale} = getDefaultModel().stratification
        expect(stratificationGridFromBand([], 'missing')).toEqual({crs, scale})
    })
})

// Both panels persist CONCRETE values. A Scale is calculated once, when a source or band is selected, and is
// ordinary configuration from then on - never a live binding that silently re-derives.
describe('the Proportions Scale a band selection writes', () => {
    const bands = [
        {id: 'probability', crs: 'EPSG:4326', nominalScale: 10},
        {id: 'coarse', crs: 'EPSG:4326', nominalScale: 100}
    ]

    describe('a stratified design', () => {
        it('takes the coarser of the Stratification Scale and the selected property band', () => {
            expect(proportionsScaleFromBand(bands, 'probability', {stratificationScale: 30})).toBe(30)
            expect(proportionsScaleFromBand(bands, 'coarse', {stratificationScale: 30})).toBe(100)
        })

        it('takes the Stratification Scale for a recipe property, which declares no grid', () => {
            expect(proportionsScaleFromBand(undefined, 'probability', {stratificationScale: 100})).toBe(100)
        })

        it('reads the SELECTED band, not the first', () => {
            expect(proportionsScaleFromBand(bands, 'coarse', {stratificationScale: 10})).toBe(100)
        })
    })

    describe('an unstratified design', () => {
        it('ignores the Stratification Scale entirely', () => {
            expect(proportionsScaleFromBand(bands, 'probability', {unstratified: true, stratificationScale: 100})).toBe(10)
        })

        it('falls back to the recipe default for a recipe property', () => {
            expect(proportionsScaleFromBand(undefined, 'probability', {unstratified: true, stratificationScale: 100}))
                .toBe(getDefaultModel().stratification.scale)
        })
    })

    it('falls back to the recipe default when nothing usable is available', () => {
        const {scale} = getDefaultModel().stratification
        expect(proportionsScaleFromBand(undefined, undefined, {})).toBe(scale)
        expect(proportionsScaleFromBand(bands, 'missing', {stratificationScale: 0})).toBe(scale)
        expect(proportionsScaleFromBand(bands, 'missing', {stratificationScale: 'wide'})).toBe(scale)
    })

    it('keeps fractional scales, trimmed of floating-point noise', () => {
        expect(proportionsScaleFromBand([{id: 'b', nominalScale: 13.77}], 'b', {stratificationScale: 9.9763})).toBe(13.77)
        expect(proportionsScaleFromBand([{id: 'b', nominalScale: 9.999996837195955}], 'b', {unstratified: true})).toBe(10)
    })
})

// A visible field is an OVERRIDE: what the user typed wins, and clearing it falls back to what the current
// selection provides. Blank is a form-level operation - the recipe only ever stores the effective value.
describe('the effective Stratification grid', () => {
    const {crs: DEFAULT_CRS, scale: DEFAULT_SCALE} = getDefaultModel().stratification
    const source = {sourceCrs: 'EPSG:32633', sourceScale: 10}

    it('uses what the user typed', () => {
        expect(effectiveStratificationGrid({crs: 'EPSG:6933', scale: '30', ...source}))
            .toEqual({crs: 'EPSG:6933', scale: 30})
    })

    it('falls back to the source when a field is cleared', () => {
        expect(effectiveStratificationGrid({crs: '', scale: '', ...source}))
            .toEqual({crs: 'EPSG:32633', scale: 10})
        expect(effectiveStratificationGrid({crs: null, scale: undefined, ...source}))
            .toEqual({crs: 'EPSG:32633', scale: 10})
    })

    it('overrides each field independently', () => {
        expect(effectiveStratificationGrid({crs: 'EPSG:6933', scale: '', ...source}))
            .toEqual({crs: 'EPSG:6933', scale: 10})
        expect(effectiveStratificationGrid({crs: '', scale: '30', ...source}))
            .toEqual({crs: 'EPSG:32633', scale: 30})
    })

    it('falls back to the recipe default when the source provides nothing', () => {
        expect(effectiveStratificationGrid({crs: '', scale: ''}))
            .toEqual({crs: DEFAULT_CRS, scale: DEFAULT_SCALE})
        expect(effectiveStratificationGrid({crs: '', scale: '', sourceCrs: null, sourceScale: 0}))
            .toEqual({crs: DEFAULT_CRS, scale: DEFAULT_SCALE})
    })

    // Clearing means "use the default"; typing 0 means something the design cannot run on, and silently
    // reading the source instead would run a calculation the user did not ask for.
    it('keeps a nonblank invalid Scale invalid rather than falling back', () => {
        expect(effectiveStratificationGrid({crs: '', scale: '0', ...source}).scale).toBeNull()
        expect(effectiveStratificationGrid({crs: '', scale: '-5', ...source}).scale).toBeNull()
        expect(effectiveStratificationGrid({crs: '', scale: 'abc', ...source}).scale).toBeNull()
    })

    it('keeps fractional scales', () => {
        expect(effectiveStratificationGrid({scale: '13.77', ...source}).scale).toBe(13.77)
        expect(effectiveStratificationGrid({scale: '', sourceScale: 9.9763}).scale).toBe(9.9763)
    })
})

describe('the effective Proportions Scale', () => {
    const {scale: DEFAULT_SCALE} = getDefaultModel().stratification

    it('uses what the user typed', () => {
        expect(effectiveProportionsScale({scale: '13.77', defaultScale: 30})).toBe(13.77)
    })

    it('falls back to the selection default when cleared', () => {
        expect(effectiveProportionsScale({scale: '', defaultScale: 30})).toBe(30)
        expect(effectiveProportionsScale({scale: null, defaultScale: 9.9763})).toBe(9.9763)
    })

    it('falls back to the recipe default when there is no selection default', () => {
        expect(effectiveProportionsScale({scale: ''})).toBe(DEFAULT_SCALE)
        expect(effectiveProportionsScale({scale: '', defaultScale: 0})).toBe(DEFAULT_SCALE)
    })

    it('keeps a nonblank invalid Scale invalid rather than falling back', () => {
        expect(effectiveProportionsScale({scale: '0', defaultScale: 30})).toBeNull()
        expect(effectiveProportionsScale({scale: 'abc', defaultScale: 30})).toBeNull()
    })
})
