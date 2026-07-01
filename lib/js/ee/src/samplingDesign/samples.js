import {catchError, defer, forkJoin, map, of, switchMap, tap, throwError} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {getLogger} from '#sepal/log'

import {randomSampleCandidates, stratifiedRandomSample, thinToAllocation} from './randomSampling.js'
import {addReproductionMetadata, addSampleProperties} from './sampleProperties.js'
import {stratificationImage$} from './stratificationImage.js'
import {BASE_GRID_SLACK, filterSamples, selectSystematicLevels, stratifiedSystematicSample, stratifiedSystematicSampleImage, systematicLevelCountsImage, systematicPreviewFeatures, systematicPreviewImage, systematicSelectionSummary} from './systematicSampling.js'
import {findShortfalls, getSampleCounts$} from './validateSampleCounts.js'

// Shared Sampling Design sample generation - the single source of the random/systematic algorithm,
// adaptive density selection, sample properties and reproduction metadata. Used by both the export task
// (modules/task) and the map preview (modules/gee). Pure EE + getInfo + rxjs; no #task dependency.

const SQRT3 = Math.sqrt(3)
const MAX_DENSITY_OFFSETS = 24
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

// Per-density selection summary computed from the sample IMAGE (systematicLevelCountsImage via
// reduceRegion) - NO reduceToVectors. One getInfo returns parallel per-stratum lists which become client
// dictionaries: {raw} (EXACT sufficiency), {actual} (OVER/CLOSEST scoring) and {levels} (previewLevel,
// carried to the raster mask so nothing is recomputed for the winning density). maxRetries=0: this only
// drives exploratory density selection; retrying a timeout / memory error on an ever-denser grid wastes
// time, the best-effort search tolerates the failure, and the final validateSampleCounts$ guard (export)
// keeps its own retry semantics.
const timedDensitySummary$ = (label, {allocation, eeStratification, region, sampleArrangement, densityOffset}) =>
    defer(() => {
        const started = Date.now()
        log.info(`[sampling-design] ${label}: count start`)
        const sampleImage = stratifiedSystematicSampleImage(
            systematicSampleArgs({allocation, eeStratification, region, sampleArrangement, densityOffset})
        )
        const counts = systematicLevelCountsImage(sampleImage, region, sampleArrangement.scale)
        const selected = selectSystematicLevels({counts, allocation, strategy: sampleArrangement.sampleSizeStrategy})
        return ee.getInfo$(systematicSelectionSummary(selected), 'selected-level summary count', 0).pipe(
            map(([strata, rawCounts, actualCounts, previewLevels]) => ({
                raw: toByStratum(strata, rawCounts),
                actual: toByStratum(strata, actualCounts),
                levels: toByStratum(strata, previewLevels)
            })),
            tap({
                next: summary => log.info(`[sampling-design] ${label}: count done (${elapsed(started)}): ${countsSummary(summary.actual)}`),
                error: error => log.warn(`[sampling-design] ${label}: count failed (${elapsed(started)}): ${error?.message || error}`)
            })
        )
    })

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

// Final random sample FeatureCollection (samples + reproduction metadata), used by preview and export.
export const randomSamples$ = ({allocation, eeStratification, region, sampleArrangement}) => {
    const sampleArgs = randomSampleArgs({allocation, eeStratification, region, sampleArrangement})
    log.info(`[sampling-design] random samples start: requestedSamples=${requestedSamples(allocation)}, minDistance=${sampleArrangement.minDistance || ''}, scale=${sampleArrangement.scale || ''}, crs=${gridCrsOf(sampleArrangement)}`)
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
            // Mirror the slack-adjusted base diameter used in stratifiedSystematicSample so this offset
            // range starts from the same base exponent densityOffset=0 actually builds.
            const targetDiameter = 0.5 * Math.sqrt(8 * Number(stratum.area) / (3 * SQRT3 * Number(stratum.sampleSize))) * BASE_GRID_SLACK
            return Math.floor(Math.log2(targetDiameter)) - minExponent
        })
        .filter(Number.isFinite)
    const maxOffset = Math.min(MAX_DENSITY_OFFSETS, Math.max(0, ...(offsets.length ? offsets : [0])))
    return Array.from({length: maxOffset + 1}, (_value, index) => index)
}

const systematicSampleArgs = ({allocation, eeStratification, region, sampleArrangement, densityOffset}) => ({
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

const sampleAt = params => stratifiedSystematicSample(systematicSampleArgs(params))

const filterAt = ({unfilteredSamples, allocation, region, sampleArrangement}) =>
    filterSamples({
        region,
        samples: unfilteredSamples,
        allocation,
        strategy: sampleArrangement.sampleSizeStrategy,
        seed: sampleArrangement.seed
    })

// Choose the base-grid density for a systematic design, scoring ENTIRELY from the sample image (grouped
// level counts via reduceRegion - no reduceToVectors). Returns {densityOffset, levelsByStratum} where
// levelsByStratum is the client-side {stratumValue: previewLevel} the winning density produced, carried
// out so neither export nor preview recomputes the selection.
export const chooseSystematicDensity$ = ({allocation, eeStratification, region, sampleArrangement}) => {
    const densityOffsets = systematicDensityOffsets(allocation, sampleArrangement)
    const strategy = sampleArrangement.sampleSizeStrategy
    log.info(`[sampling-design] systematic samples start: requestedSamples=${requestedSamples(allocation)}, strategy=${strategy || 'EXACT'}, densityOffsets=${densityOffsets.join(',')}, minDistance=${sampleArrangement.minDistance || ''}, scale=${sampleArrangement.scale || ''}, crs=${gridCrsOf(sampleArrangement)}, gridOrigin=${sampleArrangement.gridOrigin || 'FIXED'}`)

    const summaryAt$ = densityOffset =>
        timedDensitySummary$(
            `systematic ${strategy || 'EXACT'} densityOffset=${densityOffset}`,
            {allocation, eeStratification, region, sampleArrangement, densityOffset}
        )

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

    // OVER: smallest non-negative surplus among accepted densities. CLOSEST: smallest absolute
    // difference, every stratum non-empty. Both score from the selected-level summary counts (image
    // grouped-level table); no filtered FeatureCollection is materialized during selection.
    //
    // The density search steps coarsest -> densest and is BEST-EFFORT once a valid candidate exists:
    //   - Diminishing returns: when a strictly better candidate is accepted, we then compare its score to
    //     the previous accepted score. If the improvement is below `improvementThreshold`, we keep the
    //     just-accepted (better) candidate and stop - a one-step lookahead, so we always see whether the
    //     denser offset actually helped before quitting. The area-based first guess is usually good, so
    //     this avoids scanning ever-denser (and ever more expensive) grids to shave off a few samples.
    //   - Non-improvement stop (CLOSEST only, `stopOnNonImprovement`): CLOSEST's absolute-difference score
    //     tends to be monotonic enough that once an accepted denser offset fails to beat the best (equal or
    //     worse), later offsets are unlikely to be worth their rising cost - so stop and keep the best.
    //     This is a heuristic, not a guarantee (a much denser offset could in principle do better). Without
    //     it, equal-scoring offsets (0,1,2 tie) would scan the whole range for nothing. OVER's surplus is
    //     less predictable in density, so it keeps scanning all successful offsets (flag off).
    //   - Failure tolerance: if an exploratory offset's count fails (EE timeout / memory limit) and a
    //     candidate has already been accepted, return that best candidate instead of failing. Only when
    //     nothing has been accepted yet does the error propagate (fail clearly).
    // The thresholds are heuristic early-stops, not optimality proofs; the final validateSampleCounts$
    // guard (export) still backstops whatever density is chosen.
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
                    // Accepted but no better than the current best: denser offsets only add cost. For
                    // CLOSEST that also means no improvement is coming, so stop and keep the best.
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

// Export path: choose the density (image-based selection above), then MATERIALIZE the chosen unfiltered
// FeatureCollection (this is the only reduceToVectors, and only for the winning density). The task
// materializes it to a temp asset and filters; systematicSamples$ filters it in-memory.
export const chooseSystematicUnfiltered$ = params =>
    chooseSystematicDensity$(params).pipe(
        map(({densityOffset}) => ({
            unfilteredSamples: sampleAt({...params, densityOffset}),
            densityOffset
        }))
    )

// Finalize systematic samples: attach sample properties + reproduction metadata to a filtered collection.
export const finalizeSystematicSamples = ({filteredSamples, allocation, sampleArrangement, densityOffset}) =>
    addReproductionMetadata(
        addSampleProperties(filteredSamples, allocation),
        systematicMetadata(sampleArrangement, densityOffset)
    )

// Final systematic sample FeatureCollection (in-memory filter). Used by export via getFeatures$/samples$.
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

// Shared systematic preview pipeline (or null if it isn't a ready systematic design). Reuses the exact
// density-selection policy (chooseSystematicDensity$), which is fully image-based and carries out the
// winning density's per-stratum selected levels - so selection NEVER recomputes and (raster) never
// vectorizes. Rebuilds the winning density's sample image, then hands
// {sampleImage, levelsByStratum, allocation, region, sampleArrangement} to `render` to produce the ee
// object. No final count validation - that stays in export.
const systematicPreview$ = (model, render) => {
    const allocation = model?.sampleAllocation?.allocation
    const sampleArrangement = model?.sampleArrangement
    if (!allocation?.length || sampleArrangement?.arrangementStrategy !== 'SYSTEMATIC') {
        return of(null)
    }
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

// Raster dot-mask preview (single-band image for ee.getMap$ with a palette). Kept alongside the
// FeatureCollection preview so the two can be compared; samplesMap chooses via an internal flag.
export const systematicPreviewImage$ = (model, {dotRadius} = {}) =>
    systematicPreview$(model, ({sampleImage, levelsByStratum, allocation}) =>
        systematicPreviewImage({sampleImage, selectedLevels: levelsByStratum, allocation, dotRadius})
    )

// FeatureCollection preview: exact centroid points, vectorizing ONLY the selected sample pixels (not the
// full candidate grid), styled through the existing EarthEngineTableLayer / getMap path.
export const systematicPreviewFeatures$ = model =>
    systematicPreview$(model, ({sampleImage, levelsByStratum, allocation, region, sampleArrangement}) =>
        systematicPreviewFeatures({
            sampleImage,
            selectedLevels: levelsByStratum,
            allocation,
            region,
            scale: sampleArrangement.scale,
            strategy: sampleArrangement.sampleSizeStrategy,
            seed: sampleArrangement.seed
        })
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
