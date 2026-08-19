import {effectiveArrangement, resolveArrangementGrids} from '#sepal/ee/samplingDesign/effectiveArrangement'
import {REPRODUCTION_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {randomReproductionMetadata, systematicReproductionMetadata} from '#sepal/ee/samplingDesign/samples'

// In transform mode reproduction records the transform EXACTLY, and keeps the derived effective Scale alongside
// it - both are wanted to reproduce a design.
const resolved = ({crsTransform, scale, arrangementStrategy = 'RANDOM'}) => resolveArrangementGrids(
    effectiveArrangement({
        stratification: {skip: false, crs: 'EPSG:32636', scale, crsTransform},
        sampleArrangement: {arrangementStrategy, sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', minDistance: 1000, seed: 7, crs: 'EPSG:6931'}
    })
)

describe('reproduction metadata in transform mode', () => {
    const transform = '[10, 0, 300000, 0, -10, 200000]'

    it('records the parsed transform exactly', () => {
        expect(randomReproductionMetadata(resolved({crsTransform: transform})).crsTransform)
            .toEqual([10, 0, 300000, 0, -10, 200000])
    })

    it('keeps the derived effective Scale alongside the transform', () => {
        expect(randomReproductionMetadata(resolved({crsTransform: transform})).scale).toBe(10)
    })

    it('records the transform for Systematic too', () => {
        const meta = systematicReproductionMetadata(resolved({crsTransform: transform, arrangementStrategy: 'SYSTEMATIC'}), 0)
        expect(meta.crsTransform).toEqual([10, 0, 300000, 0, -10, 200000])
        expect(meta.scale).toBe(10)
    })

    it('omits the transform in scale mode', () => {
        const meta = randomReproductionMetadata(resolved({scale: 30}))
        expect('crsTransform' in meta).toBe(false)
        expect(meta.scale).toBe(30)
    })

    it('carries crsTransform in the fixed SEPAL reproduction schema', () => {
        expect(REPRODUCTION_PROPERTY_NAMES).toContain('crsTransform')
    })

    it('never records both a stored scale and a transform', () => {
        const meta = randomReproductionMetadata(resolved({crsTransform: transform, scale: 999}))
        expect(meta.scale).toBe(10)
    })
})
