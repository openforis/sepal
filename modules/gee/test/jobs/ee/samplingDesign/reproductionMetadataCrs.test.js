import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

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
        assert.equal(metadata.crs, 'EPSG:6933')
        assert.equal(metadata.gridCrs, 'EPSG:6933')
        assert.equal(noWkt(metadata), true)
    })

    it('records the Stratification CRS as its configured id, never the resolved WKT', () => {
        const metadata = randomReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6931', stratificationCrs: 'EPSG:6933'}))
        assert.equal(metadata.stratificationCrs, 'EPSG:6933')
        assert.equal(noWkt(metadata), true)
    })

    it('records a non-curated Stratification CRS unchanged', () => {
        const metadata = randomReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6933', stratificationCrs: 'EPSG:32636'}))
        assert.equal(metadata.stratificationCrs, 'EPSG:32636')
        assert.equal(metadata.crs, 'EPSG:6933')
    })

    it('keeps the other reproduction fields intact alongside the ids, with no transform', () => {
        const metadata = randomReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6933'}))
        assert.partialDeepStrictEqual(metadata, {
            arrangementStrategy: 'RANDOM',
            sampleSizeStrategy: null,
            gridOrigin: null,
            seed: 6,
            scale: 100,
            selectedDensityOffset: null
        })
        // minDistance is Systematic-only; there is no user-facing transform.
        assert.equal('minDistance' in metadata, false)
        // Scale mode: no transform is configured, so none is recorded.
        assert.equal('gridCrsTransform' in metadata, false)
    })

    it('records a polar option as its configured id', () => {
        assert.equal(
            randomReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6932'})).crs,
            'EPSG:6932'
        )
    })
})

describe('systematicReproductionMetadata CRS', () => {
    it('records the configured EPSG:6933 id, never the resolved WKT', () => {
        const metadata = systematicReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6933'}), 2)
        assert.equal(metadata.crs, 'EPSG:6933')
        assert.equal(metadata.gridCrs, 'EPSG:6933')
        assert.equal(noWkt(metadata), true)
    })

    it('records the Stratification CRS separately from the placement CRS', () => {
        const metadata = systematicReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6931', stratificationCrs: 'EPSG:32636'}), 2)
        assert.equal(metadata.crs, 'EPSG:6931')
        assert.equal(metadata.stratificationCrs, 'EPSG:32636')
    })

    it('keeps the other reproduction fields intact alongside the ids, with no transform', () => {
        const metadata = systematicReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6933'}), 2)
        assert.partialDeepStrictEqual(metadata, {
            arrangementStrategy: 'SYSTEMATIC',
            sampleSizeStrategy: 'OVER',
            gridOrigin: 'SEEDED',
            seed: 6,
            minDistance: 300,
            scale: 100,
            selectedDensityOffset: 2
        })
        // Scale mode: no transform is configured, so none is recorded.
        assert.equal('gridCrsTransform' in metadata, false)
    })

    it('records a polar option as its configured id', () => {
        const metadata = systematicReproductionMetadata(resolvedArrangement({arrangementCrs: 'EPSG:6931'}), 0)
        assert.equal(metadata.crs, 'EPSG:6931')
        assert.equal(metadata.gridCrs, 'EPSG:6931')
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
        assert.equal(
            systematicReproductionMetadata(arrangementFor({scale: 10}), 0).minDistance,
            20
        )
        assert.equal(
            systematicReproductionMetadata(arrangementFor({scale: 30}), 0).minDistance,
            60
        )
    })

    it('records an explicit distance unchanged, including one below the floor', () => {
        assert.equal(
            systematicReproductionMetadata(arrangementFor({minDistance: 60, scale: 10}), 0).minDistance,
            60
        )
        assert.equal(
            systematicReproductionMetadata(arrangementFor({minDistance: 1, scale: 10}), 0).minDistance,
            1
        )
    })
})
