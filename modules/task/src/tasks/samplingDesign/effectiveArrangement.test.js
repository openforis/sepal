import {effectiveArrangement} from '#sepal/ee/samplingDesign/effectiveArrangement'

describe('effectiveArrangement four-mode matrix', () => {
    // Conflicting CRS on each side: a stratified design must use the Stratification CRS (EPSG:6933), and only
    // unstratified Systematic uses the Arrangement CRS (EPSG:6931).
    const arrangement = {
        arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED',
        minDistance: 1000, seed: 42, crs: 'EPSG:6931'
    }
    const stratification = {skip: false, scale: 300, crs: 'EPSG:6933'}

    describe('stratified Systematic', () => {
        it('takes Scale and CRS from Stratification', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: arrangement})
            expect(result).toEqual({
                arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED',
                seed: 42, scale: 300, crs: 'EPSG:6933', minDistance: 1000
            })
        })

        it('resolves a blank minDistance to twice the Stratification Scale', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: {...arrangement, minDistance: null}})
            expect(result.minDistance).toBe(600)
        })
    })

    describe('stratified Random', () => {
        const random = {...arrangement, arrangementStrategy: 'RANDOM'}
        it('takes Scale and CRS from Stratification and Seed, dropping Systematic-only settings', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: random})
            expect(result).toEqual({arrangementStrategy: 'RANDOM', seed: 42, scale: 300, crs: 'EPSG:6933'})
            for (const field of ['minDistance', 'sampleSizeStrategy', 'gridOrigin']) {
                expect(field in result).toBe(false)
            }
        })
    })

    describe('unstratified Systematic', () => {
        const strat = {skip: true}
        it('uses the Arrangement CRS, keeps sampling rules, and omits scale', () => {
            const result = effectiveArrangement({stratification: strat, sampleArrangement: arrangement})
            expect(result).toEqual({
                arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED',
                seed: 42, crs: 'EPSG:6931', minDistance: 1000
            })
            expect('scale' in result).toBe(false)
        })

        it('defaults the CRS to EPSG:6933 when none is configured', () => {
            const result = effectiveArrangement({stratification: strat, sampleArrangement: {...arrangement, crs: undefined}})
            expect(result.crs).toBe('EPSG:6933')
        })

        it('keeps a blank minDistance blank (no additional spacing constraint)', () => {
            const result = effectiveArrangement({stratification: strat, sampleArrangement: {...arrangement, minDistance: null}})
            expect(result.minDistance).toBeNull()
        })
    })

    describe('unstratified Random', () => {
        it('keeps only Arrangement strategy and Seed - no grid, no minDistance', () => {
            const result = effectiveArrangement({stratification: {skip: [true]}, sampleArrangement: {...arrangement, arrangementStrategy: 'RANDOM'}})
            expect(result).toEqual({arrangementStrategy: 'RANDOM', seed: 42})
            for (const field of ['scale', 'crs', 'minDistance', 'sampleSizeStrategy', 'gridOrigin']) {
                expect(field in result).toBe(false)
            }
        })
    })
})
