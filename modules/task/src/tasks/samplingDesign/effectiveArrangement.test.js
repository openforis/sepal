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

// Scale and transform are never simultaneously authoritative. Rather than leaving a tolerant reader
// (gridPixelSize prefers the transform) disagreeing with a strict validator (the candidate function throws on
// both), the boundary emits exactly ONE definition, so downstream never sees the pair.
describe('Stratification grid definition is scale XOR transform', () => {
    const arrangement = {arrangementStrategy: 'RANDOM', seed: 1, crs: 'EPSG:6933'}
    const grid = stratification => effectiveArrangement({stratification, sampleArrangement: arrangement}).stratificationGrid

    it('emits scale when no transform is configured', () => {
        expect(grid({skip: false, crs: 'EPSG:32636', scale: 30})).toEqual({crs: 'EPSG:32636', scale: 30})
    })

    it('emits the transform and NO scale when a transform is configured', () => {
        const result = grid({skip: false, crs: 'EPSG:32636', scale: 999, crsTransform: '[10, 0, 300000, 0, -10, 200000]'})
        expect(result).toEqual({crs: 'EPSG:32636', crsTransform: [10, 0, 300000, 0, -10, 200000]})
        expect('scale' in result).toBe(false)
    })

    it('falls back to scale when the transform does not parse', () => {
        expect(grid({skip: false, crs: 'EPSG:32636', scale: 30, crsTransform: 'nonsense'}))
            .toEqual({crs: 'EPSG:32636', scale: 30})
    })

    it('carries the parsed transform through as numbers, not the stored string', () => {
        expect(grid({skip: false, crs: 'EPSG:32636', crsTransform: '[20, 0, 5, 0, -20, 7]'}).crsTransform)
            .toEqual([20, 0, 5, 0, -20, 7])
    })
})
