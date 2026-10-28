import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {effectiveArrangement} from '#sepal/ee/samplingDesign/effectiveArrangement'
import {gridPixelSize} from '#sepal/recipe/samplingDesign/samplingGrid'

describe('effectiveArrangement four-mode matrix', () => {
    // Conflicting CRS on each side, so a mode that reads the wrong grid is visible: Stratification is
    // EPSG:32636 (a non-curated CRS, legal only for Stratification), Arrangement is EPSG:6931.
    const arrangement = {
        arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED',
        minDistance: 1000, seed: 42, crs: 'EPSG:6931'
    }
    const stratification = {skip: false, scale: 300, crs: 'EPSG:32636'}

    describe('stratified Systematic', () => {
        it('returns both grids, each owning its own CRS', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: arrangement})
            assert.deepEqual(result, {
                arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED',
                seed: 42, minDistance: 1000,
                stratificationGrid: {crs: 'EPSG:32636', scale: 300},
                arrangementGrid: {crs: 'EPSG:6931'}
            })
        })

        it('resolves a blank minDistance to twice the Stratification pixel size', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: {...arrangement, minDistance: null}})
            assert.equal(result.minDistance, 600)
        })

        it('defaults the Arrangement CRS when none is configured', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: {...arrangement, crs: undefined}})
            assert.deepEqual(result.arrangementGrid, {crs: 'EPSG:6933'})
        })
    })

    describe('stratified Random', () => {
        const random = {...arrangement, arrangementStrategy: 'RANDOM'}

        it('returns both grids and drops Systematic-only settings', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: random})
            assert.deepEqual(result, {
                arrangementStrategy: 'RANDOM', seed: 42,
                stratificationGrid: {crs: 'EPSG:32636', scale: 300},
                arrangementGrid: {crs: 'EPSG:6931'}
            })
            for (const field of ['minDistance', 'sampleSizeStrategy', 'gridOrigin']) {
                assert.equal(field in result, false)
            }
        })

        it('never collapses the two grids into one crs/scale pair', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: random})
            assert.equal('crs' in result, false)
            assert.equal('scale' in result, false)
        })
    })

    describe('unstratified Systematic', () => {
        const strat = {skip: true}

        it('carries the Arrangement grid only', () => {
            const result = effectiveArrangement({stratification: strat, sampleArrangement: arrangement})
            assert.deepEqual(result, {
                arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED',
                seed: 42, minDistance: 1000, arrangementGrid: {crs: 'EPSG:6931'}
            })
            assert.equal('stratificationGrid' in result, false)
        })

        it('defaults the Arrangement CRS to EPSG:6933 when none is configured', () => {
            const result = effectiveArrangement({stratification: strat, sampleArrangement: {...arrangement, crs: undefined}})
            assert.deepEqual(result.arrangementGrid, {crs: 'EPSG:6933'})
        })

        it('keeps a blank minDistance blank (no additional spacing constraint)', () => {
            const result = effectiveArrangement({stratification: strat, sampleArrangement: {...arrangement, minDistance: null}})
            assert.equal(result.minDistance, null)
        })
    })

    describe('unstratified Random', () => {
        it('carries neither grid', () => {
            const result = effectiveArrangement({stratification: {skip: [true]}, sampleArrangement: {...arrangement, arrangementStrategy: 'RANDOM'}})
            assert.deepEqual(result, {arrangementStrategy: 'RANDOM', seed: 42})
            for (const field of ['stratificationGrid', 'arrangementGrid', 'crs', 'scale', 'minDistance', 'sampleSizeStrategy', 'gridOrigin']) {
                assert.equal(field in result, false)
            }
        })
    })
})

// The Sudan land-cover source is 10 m pixels stored in geographic coordinates, so its own affine transform reads
// 0.0000898315 - degrees. Every consumer of the Stratification grid reads a pixel size in METRES: the systematic
// candidate spacing, the minimum-distance floor, the Random cell size and the reproduction metadata. The grid is
// therefore the configured CRS and metre Scale, and nothing else; whether the draw lands on the source's own
// pixel grid is decided inside Earth Engine, from the selected band's projection.
describe('the effective Stratification grid is crs and metre scale only', () => {
    const arrangement = {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', seed: 42, crs: 'EPSG:6933'}
    const geographic = {skip: false, crs: 'EPSG:4326', scale: 10, band: 'label'}
    const gridOf = (stratification, sampleArrangement = arrangement) =>
        effectiveArrangement({stratification, sampleArrangement}).stratificationGrid

    it('emits the CRS and metre Scale for Systematic and Random alike', () => {
        assert.deepEqual(gridOf(geographic), {crs: 'EPSG:4326', scale: 10})
        assert.deepEqual(
            gridOf(geographic, {...arrangement, arrangementStrategy: 'RANDOM'}),
            {crs: 'EPSG:4326', scale: 10}
        )
    })

    it('yields a 10 m pixel size, never the degree coefficient', () => {
        assert.equal(gridPixelSize(gridOf(geographic)), 10)
        assert.notEqual(gridPixelSize(gridOf(geographic)), 0.0000898315)
    })

    it('floors the systematic minimum distance at two 10 m pixels', () => {
        assert.equal(
            effectiveArrangement({stratification: geographic, sampleArrangement: {...arrangement, minDistance: null}}).minDistance,
            20
        )
    })

    it('emits the grid as those two fields and no others', () => {
        assert.deepEqual(Object.keys(gridOf(geographic)).sort(), ['crs', 'scale'])
    })

    it('keeps a coarser configured Scale when the user asks for one', () => {
        assert.deepEqual(
            gridOf({...geographic, crs: 'EPSG:6933', scale: 30}),
            {crs: 'EPSG:6933', scale: 30}
        )
    })
})
