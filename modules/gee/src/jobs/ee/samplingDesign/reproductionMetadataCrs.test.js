import {effectiveArrangement, resolveArrangementGrids} from '#sepal/ee/samplingDesign/effectiveArrangement'
import {randomReproductionMetadata, systematicReproductionMetadata} from '#sepal/ee/samplingDesign/samples'

// The production metadata builders run on a RESOLVED arrangement (the one used to build the EE graph), so the
// WKT is what they would naively record. They must record the configured id instead: reproduction metadata,
// row properties and CSV/SEPAL output are user-facing artifacts.
const resolvedArrangement = ({arrangementCrs, stratificationCrs = 'EPSG:6933', ...rest}) => resolveArrangementGrids({
    minDistance: 300,
    seed: 6,
    sampleSizeStrategy: 'OVER',
    gridOrigin: 'SEEDED',
    stratificationGrid: {crs: stratificationCrs, scale: 100},
    arrangementGrid: {crs: arrangementCrs},
    ...rest
})

const noWkt = metadata =>
    Object.values(metadata).every(value => typeof value !== 'string' || !value.includes('PROJCS'))

describe('randomReproductionMetadata CRS', () => {
    it('records the configured EPSG:6933 id, never the resolved WKT', () => {
        const metadata = randomReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6933'}))
        expect(metadata.crs).toBe('EPSG:6933')
        expect(metadata.gridCrs).toBe('EPSG:6933')
        expect(noWkt(metadata)).toBe(true)
    })

    it('records the Stratification CRS as its configured id, never the resolved WKT', () => {
        const metadata = randomReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6931', stratificationCrs: 'EPSG:6933'}))
        expect(metadata.stratificationCrs).toBe('EPSG:6933')
        expect(noWkt(metadata)).toBe(true)
    })

    it('records a non-curated Stratification CRS unchanged', () => {
        const metadata = randomReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6933', stratificationCrs: 'EPSG:32636'}))
        expect(metadata.stratificationCrs).toBe('EPSG:32636')
        expect(metadata.crs).toBe('EPSG:6933')
    })

    it('keeps the other reproduction fields intact alongside the ids, with no transform', () => {
        const metadata = randomReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6933'}))
        expect(metadata).toMatchObject({
            arrangementStrategy: 'RANDOM',
            sampleSizeStrategy: null,
            gridOrigin: null,
            seed: 6,
            scale: 100,
            selectedDensityOffset: null
        })
        // minDistance is Systematic-only; there is no user-facing transform.
        expect('minDistance' in metadata).toBe(false)
        expect('crsTransform' in metadata).toBe(false)
        expect('gridCrsTransform' in metadata).toBe(false)
    })

    it('records a polar option as its configured id', () => {
        expect(randomReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6932'})).crs).toBe('EPSG:6932')
    })
})

describe('systematicReproductionMetadata CRS', () => {
    it('records the configured EPSG:6933 id, never the resolved WKT', () => {
        const metadata = systematicReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6933'}), 2)
        expect(metadata.crs).toBe('EPSG:6933')
        expect(metadata.gridCrs).toBe('EPSG:6933')
        expect(noWkt(metadata)).toBe(true)
    })

    it('records the Stratification CRS separately from the placement CRS', () => {
        const metadata = systematicReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6931', stratificationCrs: 'EPSG:32636'}), 2)
        expect(metadata.crs).toBe('EPSG:6931')
        expect(metadata.stratificationCrs).toBe('EPSG:32636')
    })

    it('keeps the other reproduction fields intact alongside the ids, with no transform', () => {
        const metadata = systematicReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6933'}), 2)
        expect(metadata).toMatchObject({
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: 'OVER',
            gridOrigin: 'SEEDED',
            seed: 6,
            minDistance: 300,
            scale: 100,
            selectedDensityOffset: 2
        })
        expect('crsTransform' in metadata).toBe(false)
        expect('gridCrsTransform' in metadata).toBe(false)
    })

    it('records a polar option as its configured id', () => {
        const metadata = systematicReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6931'}), 0)
        expect(metadata.crs).toBe('EPSG:6931')
        expect(metadata.gridCrs).toBe('EPSG:6931')
    })
})

// Minimum distance is optional and resolved at the effective-arrangement boundary, so a blank stratified
// systematic design must reproduce as the floor it actually sampled with - never as null.
describe('systematicReproductionMetadata records the resolved minimum distance', () => {
    const arrangementFor = ({minDistance, scale}) => effectiveArrangement({
        stratification: {skip: false, scale, crs: 'EPSG:6933'},
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', seed: 6, crs: 'EPSG:6933', ...(minDistance === undefined ? {} : {minDistance})}
    })

    it('records the grid floor when the recipe leaves the distance blank', () => {
        expect(systematicReproductionMetadata(arrangementFor({scale: 10}), 0).minDistance).toBe(20)
        expect(systematicReproductionMetadata(arrangementFor({scale: 30}), 0).minDistance).toBe(60)
    })

    it('records an explicit distance unchanged, including one below the floor', () => {
        expect(systematicReproductionMetadata(arrangementFor({minDistance: 60, scale: 10}), 0).minDistance).toBe(60)
        expect(systematicReproductionMetadata(arrangementFor({minDistance: 1, scale: 10}), 0).minDistance).toBe(1)
    })
})
