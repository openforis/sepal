import {forkJoin, map, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import {effectiveArrangement} from '#sepal/ee/samplingDesign/effectiveArrangement'
import {EXPORT_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {randomSamples$} from '#sepal/ee/samplingDesign/samples'
import {stratificationImage$} from '#sepal/ee/samplingDesign/stratificationImage'
import {unstratifiedAllocation$} from '#sepal/ee/samplingDesign/unstratifiedArea'
import {getSampleCounts$} from '#sepal/ee/samplingDesign/validateSampleCounts'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {randomExportPlan$} from './randomExportPlan.js'
import {validateRandomCounts} from './randomUnderproduction.js'

export const exportRandomToAssets$ = ({taskId, description, recipe, assetId, strategy, destination, workspacePath, filenamePrefix, fileFormat, properties = {}}) => {
    const {model: {aoi, stratification, sampleAllocation: {allocation}}} = recipe
    const sampleArrangement = effectiveArrangement(recipe.model)
    // Asset exports keep rows minimal + collection-level metadata; SEPAL/CSV keeps full per-row columns.
    const rowMetadata = destination === 'SEPAL'

    // Final guard: min-distance thinning caps at the requested count, so any shortfall is real. Map a
    // successfully-computed shortfall to a structured, actionable ClientException (EE/getInfo failures still
    // propagate as their own errors).
    const validate$ = resolvedAllocation => samples =>
        getSampleCounts$(samples, 'final validation count').pipe(
            validateRandomCounts({allocation: resolvedAllocation, hasMinDistance: !!sampleArrangement.minDistance})
        )

    const export$ = samples => destination === 'SEPAL'
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

    return forkJoin({
        eeStratification: stratificationImage$(stratification),
        region: toGeometry$(aoi)
    }).pipe(
        // Unstratified designs carry no per-stratum area; inject the AOI geometry area into the single row
        // before generating candidates or writing metadata. Stratified allocation passes through unchanged.
        switchMap(({eeStratification, region}) =>
            unstratifiedAllocation$({allocation, stratification, geometry: region}).pipe(
                switchMap(resolvedAllocation =>
                    randomExportPlan$({
                        // Shared generation: adaptive density, thinning, sample + reproduction metadata.
                        samples$: randomSamples$({allocation: resolvedAllocation, eeStratification, region, sampleArrangement, rowMetadata}).pipe(
                            map(featureCollection => featureCollection.set(formatProperties(properties)))
                        ),
                        validate$: validate$(resolvedAllocation),
                        export$
                    })
                )
            )
        )
    )
}
