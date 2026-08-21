import {gridPixelSize} from '#sepal/recipe/samplingDesign/samplingGrid'

import {effectiveArrangement} from '#sepal/ee/samplingDesign/effectiveArrangement'

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
            expect(result).toEqual({
                arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED',
                seed: 42, minDistance: 1000,
                stratificationGrid: {crs: 'EPSG:32636', scale: 300},
                arrangementGrid: {crs: 'EPSG:6931'}
            })
        })

        it('resolves a blank minDistance to twice the Stratification pixel size', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: {...arrangement, minDistance: null}})
            expect(result.minDistance).toBe(600)
        })

        it('defaults the Arrangement CRS when none is configured', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: {...arrangement, crs: undefined}})
            expect(result.arrangementGrid).toEqual({crs: 'EPSG:6933'})
        })
    })

    describe('stratified Random', () => {
        const random = {...arrangement, arrangementStrategy: 'RANDOM'}

        it('returns both grids and drops Systematic-only settings', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: random})
            expect(result).toEqual({
                arrangementStrategy: 'RANDOM', seed: 42,
                stratificationGrid: {crs: 'EPSG:32636', scale: 300},
                arrangementGrid: {crs: 'EPSG:6931'}
            })
            for (const field of ['minDistance', 'sampleSizeStrategy', 'gridOrigin']) {
                expect(field in result).toBe(false)
            }
        })

        it('never collapses the two grids into one crs/scale pair', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: random})
            expect('crs' in result).toBe(false)
            expect('scale' in result).toBe(false)
        })
    })

    describe('unstratified Systematic', () => {
        const strat = {skip: true}

        it('carries the Arrangement grid only', () => {
            const result = effectiveArrangement({stratification: strat, sampleArrangement: arrangement})
            expect(result).toEqual({
                arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED',
                seed: 42, minDistance: 1000, arrangementGrid: {crs: 'EPSG:6931'}
            })
            expect('stratificationGrid' in result).toBe(false)
        })

        it('defaults the Arrangement CRS to EPSG:6933 when none is configured', () => {
            const result = effectiveArrangement({stratification: strat, sampleArrangement: {...arrangement, crs: undefined}})
            expect(result.arrangementGrid).toEqual({crs: 'EPSG:6933'})
        })

        it('keeps a blank minDistance blank (no additional spacing constraint)', () => {
            const result = effectiveArrangement({stratification: strat, sampleArrangement: {...arrangement, minDistance: null}})
            expect(result.minDistance).toBeNull()
        })
    })

    describe('unstratified Random', () => {
        it('carries neither grid', () => {
            const result = effectiveArrangement({stratification: {skip: [true]}, sampleArrangement: {...arrangement, arrangementStrategy: 'RANDOM'}})
            expect(result).toEqual({arrangementStrategy: 'RANDOM', seed: 42})
            for (const field of ['stratificationGrid', 'arrangementGrid', 'crs', 'scale', 'minDistance', 'sampleSizeStrategy', 'gridOrigin']) {
                expect(field in result).toBe(false)
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
        expect(gridOf(geographic)).toEqual({crs: 'EPSG:4326', scale: 10})
        expect(gridOf(geographic, {...arrangement, arrangementStrategy: 'RANDOM'})).toEqual({crs: 'EPSG:4326', scale: 10})
    })

    it('yields a 10 m pixel size, never the degree coefficient', () => {
        expect(gridPixelSize(gridOf(geographic))).toBe(10)
        expect(gridPixelSize(gridOf(geographic))).not.toBe(0.0000898315)
    })

    it('floors the systematic minimum distance at two 10 m pixels', () => {
        expect(effectiveArrangement({stratification: geographic, sampleArrangement: {...arrangement, minDistance: null}}).minDistance).toBe(20)
    })

    it('emits the grid as those two fields and no others', () => {
        expect(Object.keys(gridOf(geographic)).sort()).toEqual(['crs', 'scale'])
    })

    it('keeps a coarser configured Scale when the user asks for one', () => {
        expect(gridOf({...geographic, crs: 'EPSG:6933', scale: 30})).toEqual({crs: 'EPSG:6933', scale: 30})
    })
})
