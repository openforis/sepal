import {concat, forkJoin, of, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import {swallow} from '#sepal/rxjs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {randomSampleCandidates, stratifiedRandomSample, thinToAllocation} from './randomSampling.js'
import {stratificationImage$} from './stratificationImage.js'
import {findShortfalls, getSampleCounts$, validateSampleCounts$} from './validateSampleCounts.js'

// Progressively denser spacing factors applied to the area-based guess. The trailing 0 forces spacing to
// the configured minDistance - the densest the user constraint allows - on the final attempt.
const DENSITY_FACTORS = [1, 0.5, 0.25, 0.125, 0]

export const exportRandomToAssets$ = ({taskId, description, recipe, assetId, strategy, destination, workspacePath, filenamePrefix, fileFormat, properties = {}}) => {
    const {model: {
        aoi,
        stratification,
        sampleAllocation: {allocation},
        sampleArrangement: {
            minDistance,
            scale,
            crs,
            crsTransform,
            seed
        }
    }} = recipe
    const stratification$ = stratificationImage$(stratification)
    const geometry$ = toGeometry$(aoi)

    return forkJoin({
        eeStratification: stratification$,
        region: geometry$
    }).pipe(
        switchMap(({eeStratification, region}) => {
            const sampleArgs = {allocation, stratification: eeStratification, region, scale, minDistance, crs, crsTransform, seed}
            const rawSamples$ = minDistance
                ? adaptiveMinDistanceSamples$(sampleArgs)
                : of(stratifiedRandomSample(sampleArgs))
            return rawSamples$.pipe(
                switchMap(rawSamples => {
                    const samples = rawSamples.set(formatProperties(properties))
                    const export$ = destination === 'SEPAL'
                        ? tableToSepal$(taskId, {
                            collection: samples,
                            description,
                            workspacePath,
                            filenamePrefix,
                            fileFormat,
                            selectors: ['id', 'stratum', 'color']
                        })
                        : tableToAsset$({
                            taskId,
                            collection: samples,
                            description,
                            assetId,
                            strategy
                        })
                    // Final guard: min-distance thinning caps at the requested count, so any shortfall is real.
                    return concat(
                        validateSampleCounts$(samples, allocation).pipe(swallow()),
                        export$
                    )
                })
            )
        })
    )

    // Generate candidates, densifying the spacing until every stratum has enough candidates to thin down
    // to its requested count (or spacing reaches minDistance). Then thin deterministically.
    function adaptiveMinDistanceSamples$(sampleArgs) {
        const attempt$ = index => {
            const candidates = randomSampleCandidates(sampleArgs, DENSITY_FACTORS[index])
            const lastAttempt = index === DENSITY_FACTORS.length - 1
            return getSampleCounts$(candidates).pipe(
                switchMap(counts =>
                    !lastAttempt && findShortfalls(counts, allocation).length
                        ? attempt$(index + 1)
                        : of(thinToAllocation(candidates, allocation))
                )
            )
        }
        return attempt$(0)
    }
}
