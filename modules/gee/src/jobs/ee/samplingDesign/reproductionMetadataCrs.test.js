import {randomReproductionMetadata, systematicReproductionMetadata} from '#sepal/ee/samplingDesign/samples'
import {resolveSamplingGrid} from '#sepal/recipe/samplingDesign/samplingGridCrs'

// The production metadata builders run on a RESOLVED arrangement (the one used to build the EE graph), so the
// WKT is what they would naively record. They must record the configured id instead: reproduction metadata,
// row properties and CSV/SEPAL output are user-facing artifacts.
const resolvedArrangement = ({crs, ...rest}) => resolveSamplingGrid({
    crs,
    scale: 100,
    crsTransform: '',
    minDistance: 300,
    seed: 6,
    sampleSizeStrategy: 'OVER',
    gridOrigin: 'SEEDED',
    ...rest
})

const noWkt = metadata =>
    Object.values(metadata).every(value => typeof value !== 'string' || !value.includes('PROJCS'))

describe('randomReproductionMetadata CRS', () => {
    it('records the configured EPSG:6933 id, never the resolved WKT', () => {
        const metadata = randomReproductionMetadata(resolvedArrangement({crs: 'EPSG:6933'}))
        expect(metadata.crs).toBe('EPSG:6933')
        expect(metadata.gridCrs).toBe('EPSG:6933')
        expect(noWkt(metadata)).toBe(true)
    })

    it('keeps the other reproduction fields intact alongside the id', () => {
        const metadata = randomReproductionMetadata(resolvedArrangement({crs: 'EPSG:6933'}))
        expect(metadata).toMatchObject({
            arrangementStrategy: 'RANDOM',
            sampleSizeStrategy: null,
            gridOrigin: null,
            seed: 6,
            scale: 100,
            crsTransform: '',
            gridCrsTransform: '',
            selectedDensityOffset: null
        })
        // minDistance is Systematic-only, and the adaptive density factor no longer exists.
        expect('minDistance' in metadata).toBe(false)
        expect('selectedDensityFactor' in metadata).toBe(false)
    })

    it('records a transform-defined grid unchanged', () => {
        const metadata = randomReproductionMetadata(
            resolvedArrangement({crs: 'EPSG:6933', scale: undefined, crsTransform: '[100,0,0,0,-100,0]'}))
        expect(metadata.crsTransform).toBe('[100,0,0,0,-100,0]')
        expect(metadata.gridCrsTransform).toBe('[100,0,0,0,-100,0]')
        expect(metadata.crs).toBe('EPSG:6933')
        expect(noWkt(metadata)).toBe(true)
    })

    it('records a polar option as its configured id', () => {
        expect(randomReproductionMetadata(resolvedArrangement({crs: 'EPSG:6932'})).crs).toBe('EPSG:6932')
    })
})

describe('systematicReproductionMetadata CRS', () => {
    it('records the configured EPSG:6933 id, never the resolved WKT', () => {
        const metadata = systematicReproductionMetadata(resolvedArrangement({crs: 'EPSG:6933'}), 2)
        expect(metadata.crs).toBe('EPSG:6933')
        expect(metadata.gridCrs).toBe('EPSG:6933')
        expect(noWkt(metadata)).toBe(true)
    })

    it('keeps the other reproduction fields intact alongside the id', () => {
        const metadata = systematicReproductionMetadata(resolvedArrangement({crs: 'EPSG:6933'}), 2)
        expect(metadata).toMatchObject({
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: 'OVER',
            gridOrigin: 'SEEDED',
            seed: 6,
            minDistance: 300,
            scale: 100,
            crsTransform: '',
            gridCrsTransform: '',
            selectedDensityOffset: 2
        })
        expect('selectedDensityFactor' in metadata).toBe(false)
    })

    it('records a transform-defined grid unchanged', () => {
        const metadata = systematicReproductionMetadata(
            resolvedArrangement({crs: 'EPSG:6933', scale: undefined, crsTransform: '[100,0,0,0,-100,0]'}), 0)
        expect(metadata.crsTransform).toBe('[100,0,0,0,-100,0]')
        expect(metadata.crs).toBe('EPSG:6933')
        expect(noWkt(metadata)).toBe(true)
    })

    it('records a polar option as its configured id', () => {
        const metadata = systematicReproductionMetadata(resolvedArrangement({crs: 'EPSG:6931'}), 0)
        expect(metadata.crs).toBe('EPSG:6931')
        expect(metadata.gridCrs).toBe('EPSG:6931')
    })
})
