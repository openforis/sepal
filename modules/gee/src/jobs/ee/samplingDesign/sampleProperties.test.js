import {
    ALGORITHM_VERSION,
    collectionMetadata,
    REPRODUCTION_PROPERTY_NAMES,
    ROW_PROPERTY_NAMES,
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
    crs: 'EPSG:3410',
    crsTransform: '',
    gridCrs: 'EPSG:3410',
    gridCrsTransform: '',
    selectedDensityFactor: null,
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

describe('collectionMetadata', () => {
    const metadata = collectionMetadata({allocation, reproduction})

    it('carries every reproduction property plus the injected algorithmVersion', () => {
        REPRODUCTION_PROPERTY_NAMES.forEach(name =>
            expect(metadata).toHaveProperty(name)
        )
        expect(metadata.algorithmVersion).toBe(ALGORITHM_VERSION)
    })

    it('scalarizes null values to empty string', () => {
        expect(metadata.selectedDensityFactor).toBe('')
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
})
