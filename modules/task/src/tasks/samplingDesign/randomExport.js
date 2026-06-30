import {concat, forkJoin, of, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import {swallow} from '#sepal/rxjs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {randomSampleCandidates, stratifiedRandomSample, thinToAllocation} from './randomSampling.js'
import {addReproductionMetadata, addSampleProperties, EXPORT_PROPERTY_NAMES} from './sampleProperties.js'
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
            const gridCrs = crs || 'EPSG:3410'
            const gridCrsTransform = crsTransform || ''
            const sample$ = minDistance
                ? adaptiveMinDistanceSamples$(sampleArgs)
                : of({rawSamples: stratifiedRandomSample(sampleArgs), densityFactor: null})
            return sample$.pipe(
                switchMap(({rawSamples, densityFactor}) => {
                    const metadata = {
                        arrangementStrategy: 'RANDOM',
                        sampleSizeStrategy: null,
                        gridOrigin: null,
                        seed,
                        minDistance: minDistance || null,
                        scale,
                        crs: gridCrs,
                        crsTransform: gridCrsTransform,
                        gridCrs,
                        gridCrsTransform,
                        selectedDensityFactor: densityFactor,
                        selectedDensityOffset: null
                    }
                    const samples = addReproductionMetadata(
                        addSampleProperties(rawSamples, allocation),
                        metadata
                    ).set(formatProperties(properties))
                    const export$ = destination === 'SEPAL'
                        ? tableToSepal$(taskId, {
                            collection: samples,
                            description,
                            workspacePath,
                            filenamePrefix,
                            fileFormat,
                            selectors: EXPORT_PROPERTY_NAMES
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
}
