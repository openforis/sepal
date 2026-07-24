import {effectiveArrangement} from '#sepal/ee/samplingDesign/effectiveArrangement'

describe('effectiveArrangement four-mode matrix', () => {
    const arrangement = {
        arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED',
        minDistance: 1000, seed: 42, crs: 'EPSG:6931'
    }
    const stratification = {skip: false, scale: 300}

    describe('stratified Systematic', () => {
        it('takes Scale from Stratification and CRS from Arrangement', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: arrangement})
            expect(result).toEqual({
                arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED',
                seed: 42, scale: 300, crs: 'EPSG:6931', minDistance: 1000
            })
        })

        it('resolves a blank minDistance to twice the Stratification Scale', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: {...arrangement, minDistance: null}})
            expect(result.minDistance).toBe(600)
        })
    })

    describe('stratified Random', () => {
        const random = {...arrangement, arrangementStrategy: 'RANDOM'}
        it('keeps Scale from Stratification, CRS from Arrangement and Seed, dropping Systematic-only settings', () => {
            const result = effectiveArrangement({stratification, sampleArrangement: random})
            expect(result).toEqual({arrangementStrategy: 'RANDOM', seed: 42, scale: 300, crs: 'EPSG:6931'})
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
