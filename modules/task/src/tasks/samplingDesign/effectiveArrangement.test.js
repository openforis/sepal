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
