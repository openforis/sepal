import {forkJoin, map, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import {EXPORT_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {randomSamples$} from '#sepal/ee/samplingDesign/samples'
import {stratificationImage$} from '#sepal/ee/samplingDesign/stratificationImage'
import {validateSampleCounts$} from '#sepal/ee/samplingDesign/validateSampleCounts'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {randomExportPlan$} from './randomExportPlan.js'

export const exportRandomToAssets$ = ({taskId, description, recipe, assetId, strategy, destination, workspacePath, filenamePrefix, fileFormat, properties = {}}) => {
    const {model: {aoi, stratification, sampleAllocation: {allocation}, sampleArrangement}} = recipe
    // Asset exports keep rows minimal + collection-level metadata; SEPAL/CSV keeps full per-row columns
    // (collection-level metadata sidecars for SEPAL are a follow-up).
    const rowMetadata = destination === 'SEPAL'

    // Final guard: min-distance thinning caps at the requested count, so any shortfall is real.
    const validate$ = samples => validateSampleCounts$(samples, allocation)

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
        switchMap(({eeStratification, region}) =>
            randomExportPlan$({
                // Shared generation: adaptive density, thinning, sample + reproduction metadata.
                samples$: randomSamples$({allocation, eeStratification, region, sampleArrangement, rowMetadata}).pipe(
                    map(featureCollection => featureCollection.set(formatProperties(properties)))
                ),
                validate$,
                export$
            })
        )
    )
}
