import {catchError, defer, forkJoin, map, of, switchMap, tap, throwError} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {getLogger} from '#sepal/log'

import {effectiveArrangement} from './effectiveArrangement.js'
import {randomSampleCandidates, stratifiedRandomSample, thinToAllocation} from './randomSampling.js'
import {addReproductionMetadata, addSampleProperties, ROW_PROPERTY_NAMES, setCollectionMetadata, SYSTEMATIC_ROW_PROPERTY_NAMES} from './sampleProperties.js'
import {stratificationImage$} from './stratificationImage.js'
import {gridPixelSize, MAX_DENSITY_OFFSETS, minLatticeExponent, targetLatticeDiameter} from './systematicLatticeMath.js'
import {filterSamples, selectSystematicLevels, stratifiedSystematicSample, stratifiedSystematicSampleImage, systematicLevelCountsImage, systematicPreviewFeatures, systematicPreviewImage, systematicSelectionSummary} from './systematicSampling.js'
import {findShortfalls, getSampleCounts$} from './validateSampleCounts.js'

// Shared Sampling Design sample generation used by previews and recipe feature sources.

// Progressively denser random spacing factors; trailing 0 forces spacing to the configured minDistance.
const DENSITY_FACTORS = [1, 0.5, 0.25, 0.125, 0]
const log = getLogger('ee')

const gridCrsOf = sampleArrangement => sampleArrangement.crs || 'EPSG:3410'
const gridCrsTransformOf = sampleArrangement => sampleArrangement.crsTransform || ''

const elapsed = started => `${Date.now() - started}ms`

const requestedSamples = allocation =>
    allocation.reduce((sum, {sampleSize}) => sum + (Number(sampleSize) || 0), 0)

const countsSummary = counts => {
    const entries = Object.entries(counts || {})
    return entries.length
        ? entries.map(([stratum, count]) => `${stratum}:${count}`).join(', ')
        : 'none'
}

const shortfallsSummary = shortfalls =>
    shortfalls.length
        ? shortfalls
            .map(({label, stratum, actual, requested}) => `${label || `stratum ${stratum}`}: ${actual}/${requested}`)
            .join('; ')
        : 'none'

const timedCounts$ = (label, makeCounts$) =>
    defer(() => {
        const started = Date.now()
        log.info(`[sampling-design] ${label}: count start`)
        return makeCounts$().pipe(
            tap({
                next: counts => log.info(`[sampling-design] ${label}: count done (${elapsed(started)}): ${countsSummary(counts)}`),
                error: error => log.warn(`[sampling-design] ${label}: count failed (${elapsed(started)}): ${error?.message || error}`)
            })
        )
    })

// Raw candidate counts: histogram over the whole unfiltered collection. Used for random min-distance and
// systematic EXACT density selection (coarsest grid with enough raw candidates).
const timedRawCounts$ = (label, collection) =>
    timedCounts$(label, () => getSampleCounts$(collection, 'raw candidate count'))

const toByStratum = (keys, values) =>
    keys.reduce((acc, key, index) => ({...acc, [String(key)]: values[index]}), {})

// One-density image summary: grouped level counts without vectorizing candidates.
const systematicDensitySelection = ({allocation, eeStratification, region, sampleArrangement, densityOffset}) => {
    const sampleImage = stratifiedSystematicSampleImage(
        systematicSampleArgs({allocation, eeStratification, region, sampleArrangement, densityOffset})
    )
    const counts = systematicLevelCountsImage(sampleImage, region, gridPixelSize(sampleArrangement))
    return selectSystematicLevels({counts, allocation, strategy: sampleArrangement.sampleSizeStrategy})
}

// Convert the getInfo'd systematic summary lists into client dictionaries.
export const toDensitySummary = ([strata, rawCounts, actualCounts, previewLevels]) => ({
    raw: toByStratum(strata, rawCounts),
    actual: toByStratum(strata, actualCounts),
    levels: toByStratum(strata, previewLevels)
})

// Preview density search is best-effort; failed denser grids should not retry past the UI timeout.
const interactiveDensitySummary$ = ({allocation, eeStratification, region, sampleArrangement, densityOffset}) =>
    ee.getInfo$(
        systematicSelectionSummary(
            systematicDensitySelection({allocation, eeStratification, region, sampleArrangement, densityOffset})
        ),
        'selected-level summary count',
        0
    ).pipe(
        map(toDensitySummary)
    )

// Wrap a per-density summary source (`densitySummary$`) with start/done/failed timing logs.
const timedDensitySummary$ = (label, densitySummary$, params) =>
    defer(() => {
        const started = Date.now()
        log.info(`[sampling-design] ${label}: count start`)
        return densitySummary$(params).pipe(
            tap({
                next: summary => log.info(`[sampling-design] ${label}: count done (${elapsed(started)}): ${countsSummary(summary.actual)}`),
                error: error => log.warn(`[sampling-design] ${label}: count failed (${elapsed(started)}): ${error?.message || error}`)
            })
        )
    })

export const randomReproductionMetadata = (sampleArrangement, densityFactor) => ({
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
    selectedDensityFactor: null,
    selectedDensityOffset: densityOffset
})

// ---------- random ----------

const randomSampleArgs = ({allocation, eeStratification, region, sampleArrangement}) => ({
    allocation,
    stratification: eeStratification,
    region,
    scale: gridPixelSize(sampleArrangement),
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
        const label = `random densityFactor=${densityFactor}`
        return timedRawCounts$(label, candidates).pipe(
            switchMap(counts => {
                const shortfalls = findShortfalls(counts, allocation)
                if (!lastAttempt && shortfalls.length) {
                    log.info(`[sampling-design] ${label}: retry denser, shortfalls=${shortfallsSummary(shortfalls)}`)
                    return attempt$(index + 1)
                }
                if (shortfalls.length) {
                    log.info(`[sampling-design] ${label}: selected final attempt with shortfalls=${shortfallsSummary(shortfalls)}`)
                } else {
                    log.info(`[sampling-design] ${label}: selected`)
                }
                return of({rawSamples: thinToAllocation(candidates, allocation), densityFactor})
            })
        )
    }
    return attempt$(0)
}

// Final random sample FeatureCollection, used by preview/feature-source (rowMetadata: full per-row, default)
// and export. `rowMetadata: false` (asset export) keeps rows minimal and moves reproduction/allocation
// metadata to the collection level.
export const randomSamples$ = ({allocation, eeStratification, region, sampleArrangement, rowMetadata = true}) => {
    const sampleArgs = randomSampleArgs({allocation, eeStratification, region, sampleArrangement})
    log.info(`[sampling-design] random samples start: requestedSamples=${requestedSamples(allocation)}, minDistance=${sampleArrangement.minDistance || ''}, scale=${sampleArrangement.scale || ''}, crs=${gridCrsOf(sampleArrangement)}`)
    const sample$ = sampleArrangement.minDistance
        ? adaptiveMinDistanceSamples$({allocation, sampleArgs})
        : of({rawSamples: stratifiedRandomSample(sampleArgs), densityFactor: null})
    return sample$.pipe(
        map(({rawSamples, densityFactor}) => {
            const reproduction = randomReproductionMetadata(sampleArrangement, densityFactor)
            return rowMetadata
                ? addReproductionMetadata(addSampleProperties(rawSamples, allocation), reproduction)
                : setCollectionMetadata(rawSamples.select(ROW_PROPERTY_NAMES), {allocation, reproduction})
        })
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

// Complete, bounded density offsets [0..maxOffset] for the interactive density search.
export const systematicDensityOffsets = (allocation, sampleArrangement) => {
    const maxOffset = allocation.reduce(
        (max, stratum) => Math.max(max, systematicStratumMaxOffset(stratum, sampleArrangement)),
        0
    )
    return Array.from({length: maxOffset + 1}, (_value, index) => index)
}

const systematicSampleArgs = ({allocation, eeStratification, region, sampleArrangement, densityOffset}) => ({
    allocation,
    stratification: eeStratification,
    region,
    minDistance: sampleArrangement.minDistance,
    scale: gridPixelSize(sampleArrangement),
    crs: sampleArrangement.crs,
    crsTransform: sampleArrangement.crsTransform,
    gridOrigin: sampleArrangement.gridOrigin,
    seed: sampleArrangement.seed,
    densityOffset
})

const sampleAt = params => stratifiedSystematicSample(systematicSampleArgs(params))

const filterAt = ({unfilteredSamples, allocation, region, sampleArrangement}) =>
    filterSamples({
        region,
        samples: unfilteredSamples,
        allocation,
        strategy: sampleArrangement.sampleSizeStrategy,
        seed: sampleArrangement.seed
    })

// Best-effort density search for the interactive preview.
const chooseDensityOffset$ = ({densityOffsets, strategy, allocation, summaryAt$}) => {
    // EXACT: coarsest grid with enough raw candidates (level-0 cumulative); export then thins to the exact
    // count. Raw candidate counts come from the image summary, so no vectorizing during selection.
    const chooseByCandidateCount$ = () => {
        const attempt$ = index => {
            const densityOffset = densityOffsets[index]
            const lastAttempt = index === densityOffsets.length - 1
            const label = `systematic EXACT densityOffset=${densityOffset}`
            return summaryAt$(densityOffset).pipe(
                switchMap(summary => {
                    const shortfalls = findShortfalls(summary.raw, allocation)
                    const candidate = {densityOffset, levelsByStratum: summary.levels}
                    if (!lastAttempt && shortfalls.length) {
                        log.info(`[sampling-design] ${label}: retry denser, shortfalls=${shortfallsSummary(shortfalls)}`)
                        return attempt$(index + 1)
                    }
                    log.info(shortfalls.length
                        ? `[sampling-design] ${label}: selected final attempt with shortfalls=${shortfallsSummary(shortfalls)}`
                        : `[sampling-design] ${label}: selected`)
                    return of(candidate)
                })
            )
        }
        return attempt$(0)
    }

    // OVER minimizes non-negative surplus; CLOSEST minimizes absolute difference with every stratum non-empty.
    // This preview-only search stops early on small improvements and tolerates denser-grid failures once a
    // valid candidate exists.
    const chooseByFiltered$ = (score, {stopOnNonImprovement = false} = {}) => {
        const improvementThreshold = Math.max(5, requestedSamples(allocation) * 0.01)
        const evaluate$ = (index, best, densest) => {
            if (index >= densityOffsets.length) {
                const selected = best || densest
                log.info(`[sampling-design] systematic ${strategy}: selected densityOffset=${selected?.densityOffset ?? 'none'}${best ? '' : ' (fallback densest)'}`)
                return of(selected)
            }
            const densityOffset = densityOffsets[index]
            const label = `systematic ${strategy} densityOffset=${densityOffset}`
            return summaryAt$(densityOffset).pipe(
                switchMap(summary => {
                    const candidate = score(summary.actual)
                    const current = {densityOffset, levelsByStratum: summary.levels, value: candidate.value}
                    const improved = candidate.accept && (!best || candidate.value < best.value)
                    if (improved) {
                        const improvement = best ? best.value - candidate.value : Infinity
                        if (best && improvement < improvementThreshold) {
                            log.info(`[sampling-design] ${label}: score=${candidate.value}, improvement=${improvement} < ${improvementThreshold}; stopping at densityOffset=${densityOffset}`)
                            return of(current)
                        }
                        log.info(`[sampling-design] ${label}: accept=true, score=${candidate.value}, new best (improvement=${improvement === Infinity ? 'first' : improvement})`)
                        return evaluate$(index + 1, current, current)
                    }
                    // CLOSEST is monotonic enough that a non-improving denser grid is not worth scanning past.
                    if (stopOnNonImprovement && best && candidate.accept) {
                        log.info(`[sampling-design] ${label}: accept=true, score=${candidate.value} >= best densityOffset=${best.densityOffset} score=${best.value}; stopping on non-improvement`)
                        return of(best)
                    }
                    log.info(`[sampling-design] ${label}: accept=${candidate.accept}, score=${candidate.value}`)
                    return evaluate$(index + 1, best, current)
                }),
                catchError(error => {
                    if (best) {
                        log.info(`[sampling-design] ${label} failed (${error?.message || error}); using best densityOffset=${best.densityOffset} score=${best.value}`)
                        return of(best)
                    }
                    log.warn(`[sampling-design] ${label} failed (${error?.message || error}); no accepted candidate to fall back to`)
                    return throwError(() => error)
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

    switch (strategy) {
        case 'CLOSEST': return chooseByFiltered$(closestScore, {stopOnNonImprovement: true})
        case 'OVER': return chooseByFiltered$(overScore)
        default: return chooseByCandidateCount$() // EXACT
    }
}

// Choose preview density using grouped image counts, without vectorizing candidates.
export const chooseSystematicDensity$ = ({allocation, eeStratification, region, sampleArrangement}) => {
    const densityOffsets = systematicDensityOffsets(allocation, sampleArrangement)
    const strategy = sampleArrangement.sampleSizeStrategy
    log.info(`[sampling-design] systematic samples start: requestedSamples=${requestedSamples(allocation)}, strategy=${strategy || 'EXACT'}, densityOffsets=${densityOffsets.join(',')}, minDistance=${sampleArrangement.minDistance || ''}, scale=${sampleArrangement.scale || ''}, crs=${gridCrsOf(sampleArrangement)}, gridOrigin=${sampleArrangement.gridOrigin || 'FIXED'}`)
    const summaryAt$ = densityOffset =>
        timedDensitySummary$(
            `systematic ${strategy || 'EXACT'} densityOffset=${densityOffset}`,
            interactiveDensitySummary$,
            {allocation, eeStratification, region, sampleArrangement, densityOffset}
        )
    return chooseDensityOffset$({densityOffsets, strategy, allocation, summaryAt$})
}

// Unfiltered candidates for one density.
export const systematicUnfilteredSamples = params => sampleAt(params)

// Repaired strata replace their base candidates; base + repair are never appended for the same stratum.
export const mergeRepairedCandidates = ({baseSamples, repairSamples, repairedStrata}) => {
    const isRepaired = ee.Filter.inList('stratum', repairedStrata.map(stratum => stratum.stratum))
    return baseSamples.filter(isRepaired.not()).merge(repairSamples.filter(isRepaired))
}

// Interactive path vectorizes only the winning density.
export const chooseSystematicUnfiltered$ = params =>
    chooseSystematicDensity$(params).pipe(
        map(({densityOffset}) => ({
            unfilteredSamples: sampleAt({...params, densityOffset}),
            densityOffset
        }))
    )

// Asset exports keep rows minimal and move reproduction/allocation metadata to the collection level.
export const finalizeSystematicSamples = ({filteredSamples, allocation, sampleArrangement, densityOffset, rowMetadata = true}) => {
    const reproduction = systematicReproductionMetadata(sampleArrangement, densityOffset)
    return rowMetadata
        ? addReproductionMetadata(addSampleProperties(filteredSamples, allocation), reproduction)
        : setCollectionMetadata(filteredSamples.select(SYSTEMATIC_ROW_PROPERTY_NAMES), {allocation, reproduction})
}

// Final systematic FeatureCollection for recipe feature-source use.
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

// ---------- systematic raster preview ----------

// Shared systematic preview pipeline; rendering is supplied by image and feature previews.
const systematicPreview$ = (model, render) => {
    const allocation = model?.sampleAllocation?.allocation
    if (!allocation?.length || model?.sampleArrangement?.arrangementStrategy !== 'SYSTEMATIC') {
        return of(null)
    }
    const sampleArrangement = effectiveArrangement(model)
    return forkJoin({
        eeStratification: stratificationImage$(model.stratification),
        region: toGeometry$(model.aoi)
    }).pipe(
        switchMap(({eeStratification, region}) =>
            chooseSystematicDensity$({allocation, eeStratification, region, sampleArrangement}).pipe(
                map(({densityOffset, levelsByStratum}) => {
                    log.info(`[sampling-design] systematic preview: densityOffset=${densityOffset}, levels=${countsSummary(levelsByStratum)}`)
                    const sampleImage = stratifiedSystematicSampleImage(
                        systematicSampleArgs({allocation, eeStratification, region, sampleArrangement, densityOffset})
                    )
                    return render({sampleImage, levelsByStratum, allocation, region, sampleArrangement})
                })
            )
        )
    )
}

// Raster dot-mask preview.
export const systematicPreviewImage$ = (model, {dotRadius} = {}) =>
    systematicPreview$(model, ({sampleImage, levelsByStratum, allocation}) =>
        systematicPreviewImage({sampleImage, selectedLevels: levelsByStratum, allocation, dotRadius})
    )

// FeatureCollection preview vectorizes only selected sample pixels, not the full candidate grid.
export const systematicPreviewFeatures$ = model =>
    systematicPreview$(model, ({sampleImage, levelsByStratum, allocation, region, sampleArrangement}) =>
        systematicPreviewFeatures({
            sampleImage,
            selectedLevels: levelsByStratum,
            allocation,
            region,
            scale: gridPixelSize(sampleArrangement),
            strategy: sampleArrangement.sampleSizeStrategy,
            seed: sampleArrangement.seed
        })
    )

// ---------- entry point ----------

// Final sample FeatureCollection for a recipe model (or null if there's nothing to sample). Resolves the
// stratification image and AOI geometry, then dispatches by arrangement strategy.
export const samples$ = model => {
    const allocation = model?.sampleAllocation?.allocation
    if (!allocation?.length || !model?.sampleArrangement?.arrangementStrategy) {
        return of(null)
    }
    const sampleArrangement = effectiveArrangement(model)
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
