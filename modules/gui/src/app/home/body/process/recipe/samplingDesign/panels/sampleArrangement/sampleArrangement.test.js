import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {includeMinDistance, includeSeed, isSkipped, shouldShowMore} = await import('./showMore')
const {crsTransformField} = await import('./sampleArrangementForm')

const base = {
    crs: undefined,
    crsTransform: undefined,
    seed: undefined,
    arrangementStrategy: undefined,
    sampleSizeStrategy: undefined,
    gridOrigin: undefined
}

describe('shouldShowMore', () => {
    it('is collapsed for empty/new values', () => {
        expect(shouldShowMore(base)).toBe(false)
    })

    it('ignores seed entirely (seed is inline now, so it never opens More)', () => {
        expect(shouldShowMore({...base, seed: undefined})).toBe(false)
        expect(shouldShowMore({...base, seed: 1})).toBe(false)
        expect(shouldShowMore({...base, seed: 2})).toBe(false)
        expect(shouldShowMore({...base, seed: '2'})).toBe(false)
    })

    it('is collapsed for a missing CRS', () => {
        expect(shouldShowMore({...base, crs: undefined})).toBe(false)
    })

    it('is collapsed for the default CRS', () => {
        expect(shouldShowMore({...base, crs: 'EPSG:6933'})).toBe(false)
    })

    // The polar variants are non-default selections, so a saved polar recipe must reopen More.
    it('is expanded for a polar EASE-Grid 2.0 selection', () => {
        expect(shouldShowMore({...base, crs: 'EPSG:6931'})).toBe(true)
        expect(shouldShowMore({...base, crs: 'EPSG:6932'})).toBe(true)
    })

    it('is expanded for a non-default CRS', () => {
        expect(shouldShowMore({...base, crs: 'EPSG:4326'})).toBe(true)
    })

    it('is expanded when a CRS transform is present', () => {
        expect(shouldShowMore({...base, crsTransform: '[1,0,0,0,1,0]'})).toBe(true)
    })

    it('is collapsed for RANDOM + OVER + FIXED defaults', () => {
        expect(shouldShowMore({
            ...base,
            arrangementStrategy: 'RANDOM',
            sampleSizeStrategy: 'OVER',
            gridOrigin: 'FIXED'
        })).toBe(false)
    })

    it('is collapsed for SYSTEMATIC + FIXED + OVER', () => {
        expect(shouldShowMore({
            ...base,
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: 'OVER',
            gridOrigin: 'FIXED'
        })).toBe(false)
    })

    it('stays collapsed for SYSTEMATIC + SEEDED grid start at the default seed (Random must not force More open)', () => {
        expect(shouldShowMore({
            ...base,
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: 'OVER',
            gridOrigin: 'SEEDED',
            seed: 1
        })).toBe(false)
    })

    it('stays collapsed for SYSTEMATIC + EXACT at the default seed', () => {
        expect(shouldShowMore({
            ...base,
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: 'EXACT',
            seed: 1
        })).toBe(false)
    })

    it('stays collapsed for a non-default seed (seed is inline, never behind More)', () => {
        expect(shouldShowMore({
            ...base,
            arrangementStrategy: 'SYSTEMATIC',
            gridOrigin: 'SEEDED',
            seed: 2
        })).toBe(false)
    })
})

// isSkipped drives which panel owns the grid: this (Arrangement) panel shows CRS/transform + the More button
// only for unstratified (skipped) designs.
describe('isSkipped', () => {
    it('is true for boolean-true and non-empty-array skip, false otherwise', () => {
        expect(isSkipped(true)).toBe(true)
        expect(isSkipped([true])).toBe(true)
        expect(isSkipped(false)).toBe(false)
        expect(isSkipped([])).toBe(false)
        expect(isSkipped(undefined)).toBe(false)
    })
})

// includeSeed drives inline seed visibility: shown only when a seed actually affects the draw.
describe('includeSeed', () => {
    it('shows seed for random sampling, systematic EXACT, and SEEDED grid start', () => {
        expect(includeSeed({arrangementStrategy: 'RANDOM'})).toBe(true)
        expect(includeSeed({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'EXACT'})).toBe(true)
        expect(includeSeed({arrangementStrategy: 'SYSTEMATIC', gridOrigin: 'SEEDED'})).toBe(true)
    })

    it('hides seed for systematic OVER at a FIXED grid start', () => {
        expect(includeSeed({arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED'})).toBe(false)
    })
})

// check() returns '' when valid and the message id when invalid.
describe('crsTransform field validation', () => {
    const check = crsTransform => crsTransformField.check('crsTransform', {crsTransform})

    it('accepts empty (no transform) and a north-up, square transform', () => {
        expect(check('')).toBe('')
        expect(check(undefined)).toBe('')
        expect(check('[10,0,0,0,-10,0]')).toBe('')
    })

    it('rejects a south-up transform with the invalid-transform message', () => {
        expect(check('[10,0,0,0,10,0]')).toBe('process.samplingDesign.panel.sampleArrangement.form.crsTransform.invalid')
    })

    it('rejects a sheared and a non-square transform', () => {
        expect(check('[10,1,0,0,-10,0]')).toBe('process.samplingDesign.panel.sampleArrangement.form.crsTransform.invalid')
        expect(check('[10,0,0,0,-20,0]')).toBe('process.samplingDesign.panel.sampleArrangement.form.crsTransform.invalid')
    })
})

// Minimum distance constrains systematic grid spacing only; random sampling has no such setting. The same
// predicate drives field applicability and rendering, so the field cannot validate while hidden.
describe('includeMinDistance', () => {
    it('is true for systematic and false for random', () => {
        expect(includeMinDistance({arrangementStrategy: 'SYSTEMATIC'})).toBe(true)
        expect(includeMinDistance({arrangementStrategy: 'RANDOM'})).toBe(false)
    })

    it('is false for an unset arrangement', () => {
        expect(includeMinDistance({})).toBe(false)
    })
})
