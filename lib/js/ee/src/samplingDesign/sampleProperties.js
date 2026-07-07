import ee from '#sepal/ee/ee'

// Bump when the draw algorithm changes in a way that affects reproducibility.
// v1: seeded systematic origin uses a seed-derived root-lattice phase reduced modulo the current spacing
//     (consistent across compatible densities) plus integer nested level / half-level coset shifts.
// v2: systematic task export switched from an adaptive per-density selection to base + optional single
//     repair. Underproducing strata are redrawn at a denser internal repair grid that is not captured per
//     row (selectedDensityOffset records only the base offset), so repaired rows are not fully reproducible
//     from the exported metadata alone.
export const ALGORITHM_VERSION = 'samplingDesign-v2'

// Minimal per-row properties kept on EXPORTED sample features (besides geometry): sample identity + the
// join key back to stratum/allocation metadata. Everything else (label/color/areas/weights) lives at the
// collection level, not repeated on every row.
export const ROW_PROPERTY_NAMES = ['id', 'stratum']

// Systematic exports also keep the nested-lattice level actually used per row (audit of the row-skipping
// thinning), alongside the collection-level selectedDensityOffset.
export const SYSTEMATIC_ROW_PROPERTY_NAMES = [...ROW_PROPERTY_NAMES, 'selectedLevel']

// Full per-sample analysis properties. Still repeated per row for SEPAL/CSV exports (which have no
// collection-level metadata channel yet - sidecar files are a follow-up); asset exports use the minimal
// ROW_PROPERTY_NAMES above plus collection-level metadata instead.
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

// Reproduction/audit metadata - the settings and adaptively-selected parameters of the draw. Set once at
// the collection level for asset exports; still repeated per row for SEPAL/CSV.
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

// Systematic exports additionally carry the nested-lattice level actually used per stratum (set per row
// in filterSamples), so the row-skipping thinning is auditable alongside selectedDensityOffset.
export const SYSTEMATIC_EXPORT_PROPERTY_NAMES = [...EXPORT_PROPERTY_NAMES, 'selectedLevel']

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

// ---------- collection-level metadata (asset exports) ----------

// Compact per-stratum allocation metadata (client-side): label/color/area/weight/requested counts, computed
// once. Serialized into a single collection-level `strata` property instead of repeated on every row.
export const strataMetadata = allocation => {
    const totalArea = allocation.reduce((sum, stratum) => sum + Number(stratum.area || 0), 0)
    return allocation.map(stratum => ({
        stratum: Number(stratum.stratum),
        label: stratum.label != null ? String(stratum.label) : String(stratum.stratum),
        color: stratum.color != null ? String(stratum.color) : '#000000',
        area: Number(stratum.area),
        totalArea,
        weight: Number(stratum.weight),
        requestedSampleSize: Number(stratum.sampleSize)
    }))
}

// The collection-level metadata object: reproduction/audit scalars (algorithmVersion injected), the compact
// per-stratum allocation as a JSON `strata` property, and - when client-side counts are supplied - the
// selected/exported sample count per stratum as a JSON `sampleCountByStratum` property. Pure - no EE. Every
// value is an asset-safe scalar or JSON string (EE table asset export drops non-scalar collection
// properties). (`strata` carries the requested sample size; `sampleCountByStratum` is the count actually
// exported.)
export const collectionMetadata = ({allocation, reproduction, sampleCountByStratum}) => {
    const full = {...reproduction, algorithmVersion: ALGORITHM_VERSION}
    const metadata = {}
    REPRODUCTION_PROPERTY_NAMES.forEach(name => {
        metadata[name] = toScalar(full[name])
    })
    metadata.strata = JSON.stringify(strataMetadata(allocation))
    if (sampleCountByStratum != null) {
        metadata.sampleCountByStratum = JSON.stringify(sampleCountByStratum)
    }
    return metadata
}

// Server-side JSON string of the selected/exported sample count per stratum (histogram of the row `stratum`
// values), e.g. '{"1":30,"2":70}'. Built with EE string ops so it resolves to a plain string - unlike an
// ee.Dictionary, a string survives table asset export as a scalar property.
const sampleCountByStratumJson = collection => {
    const histogram = collection.aggregate_histogram('stratum')
    const entries = ee.List(histogram.keys()).map(key =>
        ee.String('"').cat(ee.String(key)).cat('":').cat(ee.Number(histogram.get(key)).format('%d'))
    )
    return ee.String('{').cat(ee.List(entries).join(',')).cat('}')
}

// Set reproduction + allocation metadata ONCE on the FeatureCollection (asset exports persist collection
// properties), keeping rows minimal. When `sampleCountByStratum` client counts are supplied they're
// serialized (via collectionMetadata) to a JSON string; otherwise the counts are computed and stringified
// server-side from the finalized rows. Either way it's a string property, not a dictionary. NOTE: the
// server-side path builds a computed ee.String - verify with an EE smoke that it survives asset export.
export const setCollectionMetadata = (collection, {allocation, reproduction, sampleCountByStratum}) => {
    const withMetadata = collection.set(collectionMetadata({allocation, reproduction, sampleCountByStratum}))
    return sampleCountByStratum != null
        ? withMetadata
        : withMetadata.set('sampleCountByStratum', sampleCountByStratumJson(collection))
}
