import ee from '#sepal/ee/ee'

// Exported so sample assets record which draw implementation produced them.
export const ALGORITHM_VERSION = 'samplingDesign-v6'

// Asset rows stay minimal; allocation details live in collection metadata.
export const ROW_PROPERTY_NAMES = ['id', 'stratum']

// Systematic rows keep the nested level used by the row-skipping selection.
export const SYSTEMATIC_ROW_PROPERTY_NAMES = [...ROW_PROPERTY_NAMES, 'selectedLevel']

// SEPAL/CSV rows carry the full analysis columns; asset rows use collection metadata instead.
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

// Reproduction metadata: configured settings plus density chosen by the draw.
export const REPRODUCTION_PROPERTY_NAMES = [
    'arrangementStrategy',
    'sampleSizeStrategy',
    'gridOrigin',
    'seed',
    'minDistance',
    'scale',
    // Keep both user-facing and effective grid fields explicit in exports.
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

// Systematic exports include the selected nested level per row.
export const SYSTEMATIC_EXPORT_PROPERTY_NAMES = [...EXPORT_PROPERTY_NAMES, 'selectedLevel']

// `actualSampleSize` comes from the finalized collection, not the requested allocation.
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

// EE table asset collection properties must be scalar.
const toScalar = value =>
    value == null ? '' : (typeof value === 'object' ? JSON.stringify(value) : value)

// Escape commas in a label so it survives comma-separated `stratum_class_names` (mirrors the image
// visualization metadata encoding, decoded back on parse).
const escapeCommas = value => String(value).replace(/,/g, '\\,')

// Categorical "By value" style convention for the exported table asset, analogous to the image asset
// `<band>_class_values/palette/names` metadata. Keyed on the row `stratum` property so a client adding the
// asset auto-styles it COLORS_BY_VALUE. All values are comma-separated scalar strings (asset-safe).
const stratumClassMetadata = strata => ({
    stratum_class_values: strata.map(stratum => stratum.stratum).join(','),
    stratum_class_palette: strata.map(stratum => stratum.color).join(','),
    stratum_class_names: strata.map(stratum => escapeCommas(stratum.label)).join(',')
})

// Repeats reproduction metadata on every row for SEPAL/CSV exports.
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

// Asset-safe collection metadata: scalars plus JSON strings for structured allocation/counts.
export const collectionMetadata = ({allocation, reproduction, sampleCountByStratum}) => {
    const full = {...reproduction, algorithmVersion: ALGORITHM_VERSION}
    const metadata = {}
    REPRODUCTION_PROPERTY_NAMES.forEach(name => {
        metadata[name] = toScalar(full[name])
    })
    const strata = strataMetadata(allocation)
    metadata.strata = JSON.stringify(strata)
    Object.assign(metadata, stratumClassMetadata(strata))
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

// Asset exports persist collection properties, so rows can stay minimal.
export const setCollectionMetadata = (collection, {allocation, reproduction, sampleCountByStratum}) => {
    const withMetadata = collection.set(collectionMetadata({allocation, reproduction, sampleCountByStratum}))
    return sampleCountByStratum != null
        ? withMetadata
        : withMetadata.set('sampleCountByStratum', sampleCountByStratumJson(collection))
}
