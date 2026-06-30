import {forkJoin, map, of, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'

import {randomSampleCandidates, stratifiedRandomSample, thinToAllocation} from './randomSampling.js'
import {addReproductionMetadata, addSampleProperties} from './sampleProperties.js'
import {stratificationImage$} from './stratificationImage.js'
import {filterSamples, stratifiedSystematicSample} from './systematicSampling.js'
import {findShortfalls, getSampleCounts$} from './validateSampleCounts.js'

// Shared Sampling Design sample generation - the single source of the random/systematic algorithm,
// adaptive density selection, sample properties and reproduction metadata. Used by both the export task
// (modules/task) and the map preview (modules/gee). Pure EE + getInfo + rxjs; no #task dependency.

const SQRT3 = Math.sqrt(3)
const MAX_DENSITY_OFFSETS = 24
// Progressively denser random spacing factors; trailing 0 forces spacing to the configured minDistance.
const DENSITY_FACTORS = [1, 0.5, 0.25, 0.125, 0]

const gridCrsOf = sampleArrangement => sampleArrangement.crs || 'EPSG:3410'
const gridCrsTransformOf = sampleArrangement => sampleArrangement.crsTransform || ''

const randomMetadata = (sampleArrangement, densityFactor) => ({
    arrangementStrategy: 'RANDOM',
    sampleSizeStrategy: null,
    gridOrigin: null,
    seed: sampleArrangement.seed,
    minDistance: sampleArrangement.minDistance || null,
    scale: sampleArrangement.scale,
    crs: gridCrsOf(sampleArrangement),
    crsTransform: gridCrsTransformOf(sampleArrangement),
    gridCrs: gridCrsOf(sampleArrangement),
    gridCrsTransform: gridCrsTransformOf(sampleArrangement),
    selectedDensityFactor: densityFactor,
    selectedDensityOffset: null
})

const systematicMetadata = (sampleArrangement, densityOffset) => ({
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
    selectedDensityFactor: null,
    selectedDensityOffset: densityOffset
})

// ---------- random ----------

const randomSampleArgs = ({allocation, eeStratification, region, sampleArrangement}) => ({
    allocation,
    stratification: eeStratification,
    region,
    scale: sampleArrangement.scale,
    minDistance: sampleArrangement.minDistance,
    crs: sampleArrangement.crs,
    crsTransform: sampleArrangement.crsTransform,
    seed: sampleArrangement.seed
})

// Densify the candidate spacing until every stratum has enough candidates to thin to its requested count
// (or spacing reaches minDistance), then thin deterministically. Returns {rawSamples, densityFactor}.
const adaptiveMinDistanceSamples$ = ({allocation, sampleArgs}) => {
    const attempt$ = index => {
        const densityFactor = DENSITY_FACTORS[index]
        const candidates = randomSampleCandidates(sampleArgs, densityFactor)
        const lastAttempt = index === DENSITY_FACTORS.length - 1
        return getSampleCounts$(candidates).pipe(
            switchMap(counts =>
                !lastAttempt && findShortfalls(counts, allocation).length
                    ? attempt$(index + 1)
                    : of({rawSamples: thinToAllocation(candidates, allocation), densityFactor})
            )
        )
    }
    return attempt$(0)
}

// Final random sample FeatureCollection (samples + reproduction metadata), used by preview and export.
export const randomSamples$ = ({allocation, eeStratification, region, sampleArrangement}) => {
    const sampleArgs = randomSampleArgs({allocation, eeStratification, region, sampleArrangement})
    const sample$ = sampleArrangement.minDistance
        ? adaptiveMinDistanceSamples$({allocation, sampleArgs})
        : of({rawSamples: stratifiedRandomSample(sampleArgs), densityFactor: null})
    return sample$.pipe(
        map(({rawSamples, densityFactor}) =>
            addReproductionMetadata(
                addSampleProperties(rawSamples, allocation),
                randomMetadata(sampleArrangement, densityFactor)
            )
        )
    )
}

// ---------- systematic ----------

// Complete, bounded density offsets [0..maxOffset] - mirrors the server-side exponent math so densifying
// past the minimum-distance clamp is a no-op.
export const systematicDensityOffsets = (allocation, sampleArrangement) => {
    const scale = Number(sampleArrangement.scale)
    const minDistance = Math.max(Number(sampleArrangement.minDistance) || scale * 2, scale * 2)
    const minExponent = Math.ceil(Math.log2(minDistance / SQRT3))
    const offsets = allocation
        .map(stratum => {
            const targetDiameter = 0.5 * Math.sqrt(8 * Number(stratum.area) / (3 * SQRT3 * Number(stratum.sampleSize)))
            return Math.floor(Math.log2(targetDiameter)) - minExponent
        })
        .filter(Number.isFinite)
    const maxOffset = Math.min(MAX_DENSITY_OFFSETS, Math.max(0, ...(offsets.length ? offsets : [0])))
    return Array.from({length: maxOffset + 1}, (_value, index) => index)
}

const sampleAt = ({allocation, eeStratification, region, sampleArrangement, densityOffset}) =>
    stratifiedSystematicSample({
        allocation,
        stratification: eeStratification,
        region,
        minDistance: sampleArrangement.minDistance,
        scale: sampleArrangement.scale,
        crs: sampleArrangement.crs,
        crsTransform: sampleArrangement.crsTransform,
        gridOrigin: sampleArrangement.gridOrigin,
        seed: sampleArrangement.seed,
        densityOffset
    })

const filterAt = ({unfilteredSamples, allocation, region, sampleArrangement}) =>
    filterSamples({
        region,
        samples: unfilteredSamples,
        allocation,
        strategy: sampleArrangement.sampleSizeStrategy,
        seed: sampleArrangement.seed
    })

// Choose the base-grid density and return {unfilteredSamples, densityOffset}. All counting is in-memory
// (no batch export / temp asset). The export task materializes the chosen unfiltered collection to a temp
// asset; the preview filters it in-memory.
export const chooseSystematicUnfiltered$ = ({allocation, eeStratification, region, sampleArrangement}) => {
    const densityOffsets = systematicDensityOffsets(allocation, sampleArrangement)
    const unfilteredAt = densityOffset => sampleAt({allocation, eeStratification, region, sampleArrangement, densityOffset})

    // EXACT: coarsest grid with enough raw candidates (level-0 cumulative), then thin to exact count.
    const chooseByCandidateCount$ = () => {
        const attempt$ = index => {
            const densityOffset = densityOffsets[index]
            const unfilteredSamples = unfilteredAt(densityOffset)
            const lastAttempt = index === densityOffsets.length - 1
            return getSampleCounts$(unfilteredSamples).pipe(
                switchMap(counts =>
                    !lastAttempt && findShortfalls(counts, allocation).length
                        ? attempt$(index + 1)
                        : of({unfilteredSamples, densityOffset})
                )
            )
        }
        return attempt$(0)
    }

    // OVER: smallest non-negative surplus across densities (ties -> coarser). CLOSEST: smallest absolute
    // difference, every stratum non-empty. Both evaluate the FILTERED result in-memory at each density.
    const chooseByFiltered$ = score => {
        const evaluate$ = (index, best, densest) => {
            if (index >= densityOffsets.length) {
                return of(best || densest)
            }
            const densityOffset = densityOffsets[index]
            const unfilteredSamples = unfilteredAt(densityOffset)
            const filtered = filterAt({unfilteredSamples, allocation, region, sampleArrangement})
            return getSampleCounts$(filtered).pipe(
                switchMap(counts => {
                    const candidate = score(counts)
                    const nextBest = candidate.accept && (!best || candidate.value < best.value)
                        ? {unfilteredSamples, densityOffset, value: candidate.value}
                        : best
                    return evaluate$(index + 1, nextBest, {unfilteredSamples, densityOffset})
                })
            )
        }
        return evaluate$(0, null, null)
    }

    const overScore = counts => ({
        accept: allocation.every(stratum => (counts[String(stratum.stratum)] || 0) >= Number(stratum.sampleSize)),
        value: allocation.reduce((sum, stratum) => sum + ((counts[String(stratum.stratum)] || 0) - Number(stratum.sampleSize)), 0)
    })
    const closestScore = counts => ({
        accept: allocation.every(stratum => (counts[String(stratum.stratum)] || 0) > 0),
        value: allocation.reduce((sum, stratum) => sum + Math.abs((counts[String(stratum.stratum)] || 0) - Number(stratum.sampleSize)), 0)
    })

    switch (sampleArrangement.sampleSizeStrategy) {
        case 'CLOSEST': return chooseByFiltered$(closestScore)
        case 'OVER': return chooseByFiltered$(overScore)
        default: return chooseByCandidateCount$() // EXACT
    }
}

// Finalize systematic samples: attach sample properties + reproduction metadata to a filtered collection.
export const finalizeSystematicSamples = ({filteredSamples, allocation, sampleArrangement, densityOffset}) =>
    addReproductionMetadata(
        addSampleProperties(filteredSamples, allocation),
        systematicMetadata(sampleArrangement, densityOffset)
    )

// Final systematic sample FeatureCollection (in-memory filter), used by preview.
export const systematicSamples$ = ({allocation, eeStratification, region, sampleArrangement}) =>
    chooseSystematicUnfiltered$({allocation, eeStratification, region, sampleArrangement}).pipe(
        map(({unfilteredSamples, densityOffset}) =>
            finalizeSystematicSamples({
                filteredSamples: filterAt({unfilteredSamples, allocation, region, sampleArrangement}),
                allocation,
                sampleArrangement,
                densityOffset
            })
        )
    )

// ---------- entry point ----------

// Final sample FeatureCollection for a recipe model (or null if there's nothing to sample). Resolves the
// stratification image and AOI geometry, then dispatches by arrangement strategy.
export const samples$ = model => {
    const allocation = model?.sampleAllocation?.allocation
    const sampleArrangement = model?.sampleArrangement
    if (!allocation?.length || !sampleArrangement?.arrangementStrategy) {
        return of(null)
    }
    return forkJoin({
        eeStratification: stratificationImage$(model.stratification),
        region: toGeometry$(model.aoi)
    }).pipe(
        switchMap(({eeStratification, region}) =>
            sampleArrangement.arrangementStrategy === 'SYSTEMATIC'
                ? systematicSamples$({allocation, eeStratification, region, sampleArrangement})
                : randomSamples$({allocation, eeStratification, region, sampleArrangement})
        )
    )
}
