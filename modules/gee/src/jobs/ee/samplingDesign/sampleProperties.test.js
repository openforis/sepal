import {jest} from '@jest/globals'

import {
    ALGORITHM_VERSION,
    collectionMetadata,
    REPRODUCTION_PROPERTY_NAMES,
    ROW_PROPERTY_NAMES,
    setCollectionMetadata,
    strataMetadata,
    SYSTEMATIC_ROW_PROPERTY_NAMES
} from '#sepal/ee/samplingDesign/sampleProperties'

const reproduction = {
    arrangementStrategy: 'SYSTEMATIC',
    sampleSizeStrategy: 'OVER',
    gridOrigin: 'FIXED',
    seed: 1,
    minDistance: 60,
    scale: 30,
    crs: 'EPSG:6933',
    gridCrs: 'EPSG:6933',
    stratificationCrs: 'EPSG:32636',
    selectedDensityOffset: 0
}

const allocation = [
    {stratum: 1, label: 'Forest', color: '#0a0', area: 300, weight: 0.3, sampleSize: 30},
    {stratum: 2, area: 700, weight: 0.7, sampleSize: 70}
]

describe('row property names (minimal per-row export columns)', () => {
    it('keeps only id + stratum for the base row set', () => {
        expect(ROW_PROPERTY_NAMES).toEqual(['id', 'stratum'])
    })

    it('adds selectedLevel for systematic rows', () => {
        expect(SYSTEMATIC_ROW_PROPERTY_NAMES).toEqual(['id', 'stratum', 'selectedLevel'])
    })

    it('does not include color or any reproduction metadata on rows', () => {
        expect(SYSTEMATIC_ROW_PROPERTY_NAMES).not.toContain('color')
        expect(SYSTEMATIC_ROW_PROPERTY_NAMES).not.toContain('label')
        REPRODUCTION_PROPERTY_NAMES.forEach(name =>
            expect(SYSTEMATIC_ROW_PROPERTY_NAMES).not.toContain(name)
        )
    })
})

describe('strataMetadata', () => {
    it('produces one compact record per stratum (label/color defaulted), not per feature', () => {
        expect(strataMetadata(allocation)).toEqual([
            {stratum: 1, label: 'Forest', color: '#0a0', area: 300, totalArea: 1000, weight: 0.3, requestedSampleSize: 30},
            {stratum: 2, label: '2', color: '#000000', area: 700, totalArea: 1000, weight: 0.7, requestedSampleSize: 70}
        ])
    })
})

// A supplied known count (exact-count draw) must be written verbatim, and the collection must never be
// histogrammed to recover a number produced by construction. `collection.set` is mocked; with a known count the
// aggregating path (sampleCountByStratumJson) is never reached, so no EE graph is built. (addSampleProperties
// and the aggregating branch construct EE objects that need initialization, so they are not exercised here.)
describe('setCollectionMetadata count source', () => {
    it('uses the supplied count verbatim and never aggregates the collection', () => {
        const collection = {set: jest.fn(function() { return this }), aggregate_histogram: jest.fn()}
        setCollectionMetadata(collection, {allocation, reproduction, sampleCountByStratum: {1: 30}})
        expect(collection.aggregate_histogram).not.toHaveBeenCalled()
        const props = Object.assign({}, ...collection.set.mock.calls.map(call => call[0]))
        expect(JSON.parse(props.sampleCountByStratum)).toEqual({1: 30})
    })
})

describe('collectionMetadata', () => {
    const metadata = collectionMetadata({allocation, reproduction})

    it('carries every reproduction property plus the injected algorithmVersion', () => {
        REPRODUCTION_PROPERTY_NAMES.forEach(name =>
            expect(metadata).toHaveProperty(name)
        )
        expect(metadata.algorithmVersion).toBe(ALGORITHM_VERSION)
    })

    // Random explicitly nulls the systematic-only strategy fields; those scalarize to blank, while a real 0
    // must survive as 0 rather than being blanked.
    it('scalarizes null values to empty string and preserves zero', () => {
        const randomShaped = collectionMetadata({
            allocation,
            reproduction: {...reproduction, arrangementStrategy: 'RANDOM', sampleSizeStrategy: null, gridOrigin: null}
        })
        expect(randomShaped.sampleSizeStrategy).toBe('')
        expect(randomShaped.gridOrigin).toBe('')
        expect(metadata.selectedDensityOffset).toBe(0)
    })

    it('holds the per-stratum allocation as a single compact JSON `strata` property', () => {
        expect(typeof metadata.strata).toBe('string')
        expect(JSON.parse(metadata.strata)).toEqual(strataMetadata(allocation))
    })

    it('omits sampleCountByStratum when no client counts are provided', () => {
        expect(metadata).not.toHaveProperty('sampleCountByStratum')
    })

    it('serializes provided client counts to a JSON string `sampleCountByStratum`', () => {
        const withCounts = collectionMetadata({allocation, reproduction, sampleCountByStratum: {1: 30, 2: 68}})
        expect(typeof withCounts.sampleCountByStratum).toBe('string')
        expect(JSON.parse(withCounts.sampleCountByStratum)).toEqual({1: 30, 2: 68})
    })

    it('only produces asset-safe scalar/string values (no nested objects/arrays)', () => {
        const withCounts = collectionMetadata({allocation, reproduction, sampleCountByStratum: {1: 30, 2: 68}})
        Object.values(withCounts).forEach(value =>
            expect(['string', 'number', 'boolean']).toContain(typeof value)
        )
    })

    describe('stratum categorical style convention', () => {
        it('writes stratum_class_values/palette/names matching the allocation strata', () => {
            expect(metadata.stratum_class_values).toBe('1,2')
            expect(metadata.stratum_class_palette).toBe('#0a0,#000000')
            expect(metadata.stratum_class_names).toBe('Forest,2')
        })

        it('keeps the class metadata as comma-separated scalar strings', () => {
            ['stratum_class_values', 'stratum_class_palette', 'stratum_class_names'].forEach(name =>
                expect(typeof metadata[name]).toBe('string')
            )
        })

        it('escapes commas in labels so they survive the comma-separated names', () => {
            const commaLabeled = collectionMetadata({
                allocation: [{stratum: 1, label: 'Forest, dense', color: '#0a0', area: 300, weight: 0.3, sampleSize: 30}],
                reproduction
            })
            expect(commaLabeled.stratum_class_names).toBe('Forest\\, dense')
        })
    })
})
