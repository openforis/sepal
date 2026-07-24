import {map} from 'rxjs'

import ee from '#sepal/ee/ee'

import {addReproductionMetadata, addSampleProperties, ROW_PROPERTY_NAMES, setCollectionMetadata} from './sampleProperties.js'
import {randomReproductionMetadata} from './samples.js'

// The tie-break random value must be independent of the primary rank, so its seed is offset from the configured
// seed. It is derived, never exposed or persisted - only the configured seed reproduces a design.
const TIE_BREAK_SEED_OFFSET = 811

// Sparse rank-based stratified Random: the eligible frame is the equal-area grid cells at Stratification Scale in
// the configured curated equal-area CRS. Each cell gets one deterministic numeric rank; only cells with
// lo_h <= rank < hi_h materialize (base uses lo_h = 0). Selection later keeps the lowest requested ranks per
// stratum, giving a simple random sample without replacement with inclusion probability n_h / M_h.

// Per-stratum candidate cells for the half-open rank interval [lo_h, hi_h). Returns features carrying `label`
// (encodes stratum + a parity that keeps adjacent candidates in separate components), `rank`, and `cellKey`.
export const sparseRandomCandidates = ({stratification, region, grid, seed, loThresholds, hiThresholds, allocation}) => {
    const pixelSize = Number(grid.scale)
    // Plain projection (no atScale): pixelCoordinates are in projection metres, so cell indices come from
    // dividing by the pixel size - the same way the systematic exporter derives i/j.
    const projection = ee.Projection(grid.crs)
    const pixelProjectionUnits = ee.Number(pixelSize).divide(projection.nominalScale())
    const coordinates = ee.Image.pixelCoordinates(projection)
    const i = coordinates.select('x').divide(pixelProjectionUnits).floor().int32()
    const j = coordinates.select('y').divide(pixelProjectionUnits).floor().int32()
    const parity = j.mod(2).add(2).mod(2).multiply(2).add(i.mod(2).add(2).mod(2))
    const stratum = stratification.select(0).int()
    const strata = allocation.map(stratumAllocation => stratumAllocation.stratum)
    const stratumIndex = stratum.remap(strata, allocation.map((_, index) => index), -1)
    const loImage = stratum.remap(strata, loThresholds, 0)
    const hiImage = stratum.remap(strata, hiThresholds, 0)
    const rank = ee.Image.random(seed, 'uniform').rename('rank')
    const accepted = rank.gte(loImage).and(rank.lt(hiImage))
    // label >= 1 (offset +1 so it is never 0, which reduceToVectors would treat as background). Parity guarantees
    // no two 8-adjacent candidates share a label, so singleton candidate cells never merge into one component.
    const label = stratumIndex.multiply(4).add(parity).add(1).toInt().rename('label')

    // These reduceToVectors arguments are load-bearing for cost at Stratification (e.g. 10 m) scale over billions
    // of pixels: a `.reproject()` on the rank field, a scale-baked projection passed as `crs`, a non-default
    // `tileScale`, or extra carried bands each blow the candidate export up so it never completes. Keep the plain
    // resolved-WKT `crs` + explicit `scale`, no reproject/tileScale, and exactly the label+rank bands (one reduced
    // value). Re-measure at full scale before changing any of these evaluation arguments.
    const vectorized = label.addBands(rank).updateMask(accepted).select(['label', 'rank']).reduceToVectors({
        geometry: region,
        crs: grid.crs,
        scale: pixelSize,
        geometryType: 'centroid',
        labelProperty: 'label',
        reducer: ee.Reducer.first().forEach(['rank']),
        maxPixels: 1e13,
        bestEffort: false
    })

    // cellKey: after vectorization, before export. Transform the singleton centroid to the grid CRS, floor to
    // integer cell indices, store canonical "i:j". Never a raster band; never rebuilt from round-tripped geometry
    // (feature properties survive export exactly, geometry does not).
    return vectorized.map(feature => {
        const centre = feature.geometry().transform(grid.crs, 0.5).coordinates()
        const cellI = ee.Number(centre.get(0)).divide(pixelSize).floor().toInt64()
        const cellJ = ee.Number(centre.get(1)).divide(pixelSize).floor().toInt64()
        return feature.set('cellKey', cellI.format('%d').cat(':').cat(cellJ.format('%d')))
    })
}

// Inspect a READY candidate asset in one evaluation: per-stratum counts (decoded from label), total size and
// distinct cellKey count. Duplicate ranks are NOT an error - selection resolves the only rank tie that matters
// (at a stratum's cutoff) deterministically. A cellKey collision is an internal grid-identity error (cellKey is
// the sample id and the tie-break key, so it must be unique); reported, never hidden with distinct().
export const inspectCandidates$ = (collection, {allocation, description = 'sparse random candidate inspection'} = {}) => {
    // toInt() so aggregate_histogram keys the index as "0"/"1"/... (a float would key as "0.0" and never match).
    const withStratumIndex = collection.map(feature =>
        feature.set('stratumIndex', feature.getNumber('label').subtract(1).divide(4).floor().toInt()))
    const info = ee.Dictionary({
        counts: withStratumIndex.aggregate_histogram('stratumIndex'),
        size: collection.size(),
        distinctKey: collection.aggregate_count_distinct('cellKey')
    })
    return ee.getInfo$(info, description).pipe(
        map(({counts, size, distinctKey}) => {
            if (distinctKey !== size) {
                throw new Error(`Sparse random cellKeys collided (${size - distinctKey} of ${size}) - grid identity error`)
            }
            const countsByStratum = {}
            allocation.forEach((stratumAllocation, index) => {
                countsByStratum[stratumAllocation.stratum] = counts[String(index)] || 0
            })
            return {countsByStratum, size}
        })
    )
}

// The lowest requested ranks per stratum (SRSWOR by rank). Stratum is decoded from the label range [4k+1, 4k+5).
// Duplicate ranks only matter at the selection cutoff: everything strictly below the nth-smallest rank is in, and
// the remaining places are filled from the candidates tied AT the cutoff, ordered by an independent random value
// keyed on cellKey. That value is deterministic per cell and independent of the primary rank, so the composite
// order (rank, tie-break) is a valid random total order - an unbiased SRSWOR that never fails on a rank tie.
export const selectLowestRanks = ({candidates, allocation, seed}) => {
    const tieBreakSeed = Number(seed) + TIE_BREAK_SEED_OFFSET
    return ee.FeatureCollection(allocation.map((stratumAllocation, index) => {
        const sampleSize = Number(stratumAllocation.sampleSize)
        const stratumCandidates = candidates.filter(ee.Filter.and(
            ee.Filter.gte('label', 4 * index + 1),
            ee.Filter.lt('label', 4 * index + 5)
        ))
        // cutoff = nth-smallest rank (the max among the n lowest); well-defined even when ranks tie.
        const cutoff = stratumCandidates.sort('rank').limit(sampleSize).aggregate_max('rank')
        const below = stratumCandidates.filter(ee.Filter.lt('rank', cutoff))
        const remaining = ee.Number(sampleSize).subtract(below.size())
        const boundary = stratumCandidates
            .filter(ee.Filter.eq('rank', cutoff))
            .randomColumn('tieBreak', tieBreakSeed, 'uniform', ['cellKey'])
            .limit(remaining, 'tieBreak')
        return below.merge(boundary).map(feature => feature.set('stratum', Number(stratumAllocation.stratum)))
    })).flatten()
}

// Turn ready candidate assets into the final export collection: select lowest ranks, use cellKey as the sample
// `id`, and attach row/collection metadata using the KNOWN requested counts (selection takes exactly n_h), so the
// selected export graph never runs a lazy aggregate_histogram.
export const selectStratifiedRandomSamples = ({candidates, allocation, sampleArrangement, rowMetadata = true}) => {
    const selected = selectLowestRanks({candidates, allocation, seed: sampleArrangement.seed})
        .map(feature => feature.set('id', feature.get('cellKey')))
    const reproduction = randomReproductionMetadata(sampleArrangement)
    const sampleCountByStratum = {}
    allocation.forEach(stratumAllocation => {
        sampleCountByStratum[String(stratumAllocation.stratum)] = Number(stratumAllocation.sampleSize)
    })
    return rowMetadata
        ? addReproductionMetadata(addSampleProperties(selected, allocation, sampleCountByStratum), reproduction)
        : setCollectionMetadata(selected.select(ROW_PROPERTY_NAMES), {allocation, reproduction, sampleCountByStratum})
}
