import {effectiveArrangement} from '#sepal/ee/samplingDesign/effectiveArrangement'

// Grid ownership by mode. Stratified reads the grid (scale + crs) from the Stratification panel; unstratified
// from the Arrangement panel (crs only). Sampling RULES always come from the arrangement.
describe('effectiveArrangement', () => {
    const sampleArrangement = {
        arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', minDistance: 1000,
        gridOrigin: 'FIXED', seed: 42, scale: 100, crs: 'EPSG:4326', crsTransform: [1, 0, 0, 0, 1, 0]
    }

    describe('stratified', () => {
        const stratification = {skip: false, scale: 300, crs: 'EPSG:3410'}

        it('takes the grid scale + crs from stratification (no transform), NOT the arrangement', () => {
            const result = effectiveArrangement({stratification, sampleArrangement})
            expect(result.scale).toBe(300)
            expect(result.crs).toBe('EPSG:3410')
            expect(result.crsTransform).toBe('')
        })

        it('takes crs + crsTransform from stratification and DROPS scale when a transform defines the grid', () => {
            const result = effectiveArrangement({
                stratification: {skip: false, scale: 300, crs: 'EPSG:3410', crsTransform: '[300,0,15,0,-300,15]'},
                sampleArrangement
            })
            expect(result.crsTransform).toBe('[300,0,15,0,-300,15]')
            expect(result.crs).toBe('EPSG:3410')
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

        it('defaults the grid crs to EPSG:3410 for a stratification without one', () => {
            expect(effectiveArrangement({stratification: {skip: false, scale: 30}, sampleArrangement}).crs).toBe('EPSG:3410')
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

        it('defaults crs to EPSG:3410 when the arrangement has none', () => {
            expect(effectiveArrangement({stratification: {skip: [true]}, sampleArrangement: {...sampleArrangement, crs: undefined}}).crs).toBe('EPSG:3410')
        })
    })
})
