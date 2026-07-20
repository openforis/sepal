import {of} from 'rxjs'

import ee from '#sepal/ee/ee'

import {stratifiedRandomSample} from './randomSampling.js'
import {addReproductionMetadata, addSampleProperties, ROW_PROPERTY_NAMES, setCollectionMetadata, SYSTEMATIC_ROW_PROPERTY_NAMES} from './sampleProperties.js'
import {gridPixelSize, MAX_DENSITY_OFFSETS, minLatticeExponent, targetLatticeDiameter} from './systematicLatticeMath.js'

// Shared Sampling Design sample generation for the export routes.

// Reproduction metadata and logs record the CONFIGURED id (EPSG:6933/6931/6932), never the resolved WKT.
const gridCrsOf = sampleArrangement => sampleArrangement.crsId || sampleArrangement.crs
const gridCrsTransformOf = sampleArrangement => sampleArrangement.crsTransform || ''

const toByStratum = (keys, values) =>
    keys.reduce((acc, key, index) => ({...acc, [String(key)]: values[index]}), {})

// Convert the getInfo'd systematic summary lists into client dictionaries.
export const toDensitySummary = ([strata, rawCounts, actualCounts, previewLevels]) => ({
    raw: toByStratum(strata, rawCounts),
    actual: toByStratum(strata, actualCounts),
    levels: toByStratum(strata, previewLevels)
})

export const randomReproductionMetadata = sampleArrangement => ({
    arrangementStrategy: 'RANDOM',
    sampleSizeStrategy: null,
    gridOrigin: null,
    seed: sampleArrangement.seed,
    // minDistance is a Systematic-only setting, so random reproduction metadata omits it.
    scale: sampleArrangement.scale,
    crs: gridCrsOf(sampleArrangement),
    crsTransform: gridCrsTransformOf(sampleArrangement),
    gridCrs: gridCrsOf(sampleArrangement),
    gridCrsTransform: gridCrsTransformOf(sampleArrangement),
    selectedDensityOffset: null
})

export const systematicReproductionMetadata = (sampleArrangement, densityOffset) => ({
    arrangementStrategy: 'SYSTEMATIC',
    sampleSizeStrategy: sampleArrangement.sampleSizeStrategy,
    gridOrigin: sampleArrangement.gridOrigin || 'FIXED',
    seed: sampleArrangement.seed,
    minDistance: sampleArrangement.minDistance,
    scale: sampleArrangement.scale,
    crs: gridCrsOf(sampleArrangement),
    crsTransform: gridCrsTransformOf(sampleArrangement),
    gridCrs: gridCrsOf(sampleArrangement),
    gridCrsTransform: gridCrsTransformOf(sampleArrangement),
    selectedDensityOffset: densityOffset
})

// ---------- random ----------

const randomSampleArgs = ({allocation, eeStratification, region, sampleArrangement}) => ({
    allocation,
    stratification: eeStratification,
    region,
    scale: gridPixelSize(sampleArrangement),
    crs: sampleArrangement.crs,
    crsTransform: sampleArrangement.crsTransform,
    seed: sampleArrangement.seed
})

// Final random sample FeatureCollection. `rowMetadata: false` (asset export) keeps rows minimal and moves
// reproduction/allocation metadata to the collection level.
export const randomSamples$ = ({allocation, eeStratification, region, sampleArrangement, rowMetadata = true}) => {
    const sampleArgs = randomSampleArgs({allocation, eeStratification, region, sampleArrangement})
    const rawSamples = stratifiedRandomSample(sampleArgs)
    const reproduction = randomReproductionMetadata(sampleArrangement)
    return of(
        rowMetadata
            ? addReproductionMetadata(addSampleProperties(rawSamples, allocation), reproduction)
            : setCollectionMetadata(rawSamples.select(ROW_PROPERTY_NAMES), {allocation, reproduction})
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
