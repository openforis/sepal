import {effectiveArrangement} from '#sepal/ee/samplingDesign/effectiveArrangement'

// Grid ownership by mode. Stratified reads the grid (scale + crs) from the Stratification panel; unstratified
// from the Arrangement panel (crs only). Sampling RULES always come from the arrangement.
describe('effectiveArrangement', () => {
    const sampleArrangement = {
        arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', minDistance: 1000,
        gridOrigin: 'FIXED', seed: 42, scale: 100, crs: 'EPSG:4326', crsTransform: [1, 0, 0, 0, 1, 0]
    }

    describe('stratified', () => {
        const stratification = {skip: false, scale: 300, crs: 'EPSG:6933'}

        it('takes the grid scale + crs from stratification (no transform), NOT the arrangement', () => {
            const result = effectiveArrangement({stratification, sampleArrangement})
            expect(result.scale).toBe(300)
            expect(result.crs).toBe('EPSG:6933')
            expect(result.crsTransform).toBe('')
        })

        it('takes crs + crsTransform from stratification and DROPS scale when a transform defines the grid', () => {
            const result = effectiveArrangement({
                stratification: {skip: false, scale: 300, crs: 'EPSG:6933', crsTransform: '[300,0,15,0,-300,15]'},
                sampleArrangement
            })
            expect(result.crsTransform).toBe('[300,0,15,0,-300,15]')
            expect(result.crs).toBe('EPSG:6933')
            expect(result.scale).toBeUndefined() // mutually exclusive - transform is the only grid definition
        })

        it('ignores a hidden arrangement crsTransform (uses stratification, empty when none)', () => {
            expect(effectiveArrangement({stratification: {skip: false, scale: 30}, sampleArrangement}).crsTransform).toBe('')
        })

        it('preserves the sampling rules from the arrangement', () => {
            const result = effectiveArrangement({stratification, sampleArrangement})
            expect(result.minDistance).toBe(1000)
            expect(result.gridOrigin).toBe('FIXED')
            expect(result.seed).toBe(42)
            expect(result.sampleSizeStrategy).toBe('OVER')
        })

        it('defaults the grid crs to EPSG:6933 for a stratification without one, and carries an explicit choice through', () => {
            expect(effectiveArrangement({stratification: {skip: false, scale: 30}, sampleArrangement}).crs).toBe('EPSG:6933')
            expect(effectiveArrangement({stratification: {skip: false, scale: 30, crs: 'EPSG:6931'}, sampleArrangement}).crs).toBe('EPSG:6931')
        })
    })

    describe('unstratified (array-shaped and boolean skip)', () => {
        it('systematic: takes crs + crsTransform from the arrangement (not stratification) and drops the grid scale', () => {
            const result = effectiveArrangement({
                stratification: {skip: true, scale: 999, crs: 'EPSG:9999', crsTransform: '[999,0,0,0,-999,0]'},
                sampleArrangement: {...sampleArrangement, crs: 'EPSG:32633', crsTransform: '[10,0,0,0,-10,0]'}
            })
            expect(result.crs).toBe('EPSG:32633')
            expect(result.crsTransform).toBe('[10,0,0,0,-10,0]') // arrangement's, not stratification's
            expect(result.scale).toBeUndefined() // no scale for unstratified systematic (analytical, minDistance-only)
        })

        it('random: retains the arrangement scale (temporary constraint - random reduceToVectors needs a raster scale)', () => {
            const result = effectiveArrangement({
                stratification: {skip: true},
                sampleArrangement: {...sampleArrangement, arrangementStrategy: 'RANDOM', crs: 'EPSG:32633'}
            })
            expect(result.crs).toBe('EPSG:32633')
            expect(result.scale).toBe(100)
        })

        it('defaults crs to EPSG:6933 when the arrangement has none, and carries an explicit choice through', () => {
            expect(effectiveArrangement({stratification: {skip: [true]}, sampleArrangement: {...sampleArrangement, crs: undefined}}).crs).toBe('EPSG:6933')
            expect(effectiveArrangement({stratification: {skip: [true]}, sampleArrangement: {...sampleArrangement, crs: 'EPSG:6932'}}).crs).toBe('EPSG:6932')
        })
    })
})

// minDistance is a Systematic-only setting. The model keeps it dormant so switching back to Systematic has a
// usable default, so a stale value on a RANDOM recipe must not reach the draw - otherwise the same recipe
// would sample differently depending on a setting the user cannot see.
describe('minDistance applicability by arrangement', () => {
    const stratification = {skip: false, scale: 300, crs: 'EPSG:6933'}
    const random = {arrangementStrategy: 'RANDOM', minDistance: 5000, seed: 1}
    const systematic = {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', minDistance: 5000, seed: 1}

    it('omits a stale minDistance for stratified RANDOM', () => {
        const result = effectiveArrangement({stratification, sampleArrangement: random})
        expect('minDistance' in result).toBe(false)
    })

    it('omits a stale minDistance for unstratified RANDOM', () => {
        const result = effectiveArrangement({stratification: {skip: [true]}, sampleArrangement: random})
        expect('minDistance' in result).toBe(false)
    })

    it('preserves minDistance for SYSTEMATIC in both modes', () => {
        expect(effectiveArrangement({stratification, sampleArrangement: systematic}).minDistance).toBe(5000)
        expect(effectiveArrangement({stratification: {skip: [true]}, sampleArrangement: systematic}).minDistance).toBe(5000)
    })

    it('produces an identical RANDOM arrangement whether or not the recipe carries a stale minDistance', () => {
        const {minDistance: _stale, ...withoutStale} = random
        expect(effectiveArrangement({stratification, sampleArrangement: random}))
            .toEqual(effectiveArrangement({stratification, sampleArrangement: withoutStale}))
    })
})
