import ee from '#sepal/ee/ee'

// Bump when the draw algorithm changes in a way that affects reproducibility.
export const ALGORITHM_VERSION = 'samplingDesign-v1'

// Per-sample analysis properties (besides geometry): stratum/sample metadata for downstream analysis.
export const SAMPLE_PROPERTY_NAMES = [
    'id',
    'stratum',
    'label',
    'color',
    'stratumArea',
    'totalArea',
    'stratumWeight',
    'requestedSampleSize',
    'actualSampleSize',
    'sampleExpansionArea',
    'sampleWeight'
]

// Reproduction/audit metadata - the settings and adaptively-selected parameters of the draw. Repeated on
// every row (required so SEPAL CSV users see them).
export const REPRODUCTION_PROPERTY_NAMES = [
    'arrangementStrategy',
    'sampleSizeStrategy',
    'gridOrigin',
    'seed',
    'minDistance',
    'scale',
    // crs/crsTransform are the effective arrangement settings; gridCrs/gridCrsTransform are the projection
    // actually used for grid/projection-based sampling.
    'crs',
    'crsTransform',
    'gridCrs',
    'gridCrsTransform',
    'selectedDensityFactor',
    'selectedDensityOffset',
    'algorithmVersion'
]

// All exported property names, used as the SEPAL table/CSV selectors (tableToSepal$ appends `.geo`).
export const EXPORT_PROPERTY_NAMES = [...SAMPLE_PROPERTY_NAMES, ...REPRODUCTION_PROPERTY_NAMES]

// Attaches stratum/sample analysis metadata to every feature of a FINALIZED sample collection. `allocation`
// (client-side) is the authoritative source for label/color/area/weight/requested counts; actualSampleSize
// is the count actually selected per stratum (from the collection itself), so the expansion area and
// sample weight reflect reality, not the request. Geometry and the existing 'id' are preserved.
export const addSampleProperties = (collection, allocation) => {
    const totalArea = allocation.reduce((sum, stratum) => sum + Number(stratum.area || 0), 0)
    const metaByStratum = {}
    allocation.forEach(stratum => {
        metaByStratum[String(stratum.stratum)] = {
            label: stratum.label != null ? String(stratum.label) : String(stratum.stratum),
            color: stratum.color != null ? String(stratum.color) : '#000000',
            stratum: Number(stratum.stratum),
            stratumArea: Number(stratum.area),
            totalArea,
            stratumWeight: Number(stratum.weight),
            requestedSampleSize: Number(stratum.sampleSize)
        }
    })
    const eeMetaByStratum = ee.Dictionary(metaByStratum)
    // Per-stratum count of the finalized collection; keys are stratum values as strings.
    const actualByStratum = ee.Dictionary(collection.aggregate_histogram('stratum'))

    return collection.map(feature => {
        const key = feature.getNumber('stratum').format('%d')
        const meta = ee.Dictionary(eeMetaByStratum.get(key))
        const actualSampleSize = ee.Number(actualByStratum.get(key))
        return feature
            .set(meta)
            .set({
                actualSampleSize: actualSampleSize,
                sampleExpansionArea: ee.Number(meta.get('stratumArea')).divide(actualSampleSize),
                sampleWeight: ee.Number(meta.get('stratumWeight')).divide(actualSampleSize)
            })
    })
}

// CSV/asset-friendly scalar: null/undefined -> '' (keeps a consistent, present column), objects/arrays
// (e.g. a crsTransform list) -> JSON string, scalars kept as-is.
const toScalar = value =>
    value == null ? '' : (typeof value === 'object' ? JSON.stringify(value) : value)

// Repeats the draw's reproduction/audit metadata on every feature. `algorithmVersion` is injected so
// callers don't have to. selectedDensityFactor (random min-distance) / selectedDensityOffset (systematic)
// are null when not applicable.
export const addReproductionMetadata = (collection, metadata) => {
    const full = {...metadata, algorithmVersion: ALGORITHM_VERSION}
    const normalized = {}
    REPRODUCTION_PROPERTY_NAMES.forEach(name => {
        normalized[name] = toScalar(full[name])
    })
    const eeMetadata = ee.Dictionary(normalized)
    return collection.map(feature => feature.set(eeMetadata))
}
