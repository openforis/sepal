import {of} from 'rxjs'

import ee from '#sepal/ee/ee'

import {unstratifiedRandomSample} from './randomSampling.js'
import {addReproductionMetadata, addSampleProperties, ROW_PROPERTY_NAMES, setCollectionMetadata, SYSTEMATIC_ROW_PROPERTY_NAMES} from './sampleProperties.js'
import {gridPixelSize, MAX_DENSITY_OFFSETS, minLatticeExponent, targetLatticeDiameter} from './systematicLatticeMath.js'

// Shared Sampling Design sample generation for the export routes.

// Reproduction metadata and logs record the CONFIGURED id (EPSG:6933/6931/6932), never the resolved WKT.
const gridCrsOf = sampleArrangement => sampleArrangement.crsId || sampleArrangement.crs

const toByStratum = (keys, values) =>
    keys.reduce((acc, key, index) => ({...acc, [String(key)]: values[index]}), {})

// Convert the getInfo'd systematic summary lists into client dictionaries.
export const toDensitySummary = ([strata, rawCounts, actualCounts, previewLevels]) => ({
    raw: toByStratum(strata, rawCounts),
    actual: toByStratum(strata, actualCounts),
    levels: toByStratum(strata, previewLevels)
})

// Grid fields are emitted only when the effective arrangement carries a grid (`'crs' in ...`), so absent fields
// are omitted from asset metadata rather than serialized as stale values.
export const randomReproductionMetadata = sampleArrangement => {
    const base = {
        arrangementStrategy: 'RANDOM',
        sampleSizeStrategy: null,
        gridOrigin: null,
        seed: sampleArrangement.seed,
        selectedDensityOffset: null
    }
    return 'crs' in sampleArrangement
        ? {
            ...base,
            scale: sampleArrangement.scale,
            crs: gridCrsOf(sampleArrangement),
            gridCrs: gridCrsOf(sampleArrangement)
        }
        : base
}

// Scale is present only when the arrangement carries it (stratified); the configured CRS/gridCrs is always
// retained. There is no user-facing transform, so none is recorded.
export const systematicReproductionMetadata = (sampleArrangement, densityOffset) => ({
    arrangementStrategy: 'SYSTEMATIC',
    sampleSizeStrategy: sampleArrangement.sampleSizeStrategy,
    gridOrigin: sampleArrangement.gridOrigin || 'FIXED',
    seed: sampleArrangement.seed,
    minDistance: sampleArrangement.minDistance,
    crs: gridCrsOf(sampleArrangement),
    gridCrs: gridCrsOf(sampleArrangement),
    selectedDensityOffset: densityOffset,
    ...('scale' in sampleArrangement ? {scale: sampleArrangement.scale} : {})
})

// ---------- random ----------

export const unstratifiedRandomSamples$ = ({allocation, region, sampleArrangement, rowMetadata = true}) => {
    const rawSamples = unstratifiedRandomSample({allocation, region, seed: sampleArrangement.seed})
    const reproduction = randomReproductionMetadata(sampleArrangement)
    // randomPoints draws exactly N points for the single synthetic stratum, so the count is known up front and
    // neither metadata path aggregates the collection to recover it.
    const stratum = allocation[0]
    const sampleCountByStratum = {[String(stratum.stratum)]: Number(stratum.sampleSize)}
    return of(
        rowMetadata
            ? addReproductionMetadata(addSampleProperties(rawSamples, allocation, sampleCountByStratum), reproduction)
            : setCollectionMetadata(rawSamples.select(ROW_PROPERTY_NAMES), {allocation, reproduction, sampleCountByStratum})
    )
}

// ---------- systematic ----------

// Densest offset a stratum can reach before the minimum-distance clamp makes densifying a no-op.
export const systematicStratumMaxOffset = (stratum, sampleArrangement) => {
    const minExponent = minLatticeExponent({minDistance: sampleArrangement.minDistance, scale: gridPixelSize(sampleArrangement)})
    const offset = Math.floor(Math.log2(targetLatticeDiameter(stratum))) - minExponent
    return Number.isFinite(offset)
        ? Math.min(MAX_DENSITY_OFFSETS, Math.max(0, offset))
        : 0
}

// Repaired strata replace their base candidates; base + repair are never appended for the same stratum.
export const mergeRepairedCandidates = ({baseSamples, repairSamples, repairedStrata}) => {
    const isRepaired = ee.Filter.inList('stratum', repairedStrata.map(stratum => stratum.stratum))
    return baseSamples.filter(isRepaired.not()).merge(repairSamples.filter(isRepaired))
}

// Asset exports keep rows minimal and move reproduction/allocation metadata to the collection level.
export const finalizeSystematicSamples = ({filteredSamples, allocation, sampleArrangement, densityOffset, rowMetadata = true}) => {
    const reproduction = systematicReproductionMetadata(sampleArrangement, densityOffset)
    return rowMetadata
        ? addReproductionMetadata(addSampleProperties(filteredSamples, allocation), reproduction)
        : setCollectionMetadata(filteredSamples.select(SYSTEMATIC_ROW_PROPERTY_NAMES), {allocation, reproduction})
}
