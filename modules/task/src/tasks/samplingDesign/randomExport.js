import {concat, forkJoin, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import {EXPORT_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {randomSamples$} from '#sepal/ee/samplingDesign/samples'
import {stratificationImage$} from '#sepal/ee/samplingDesign/stratificationImage'
import {validateSampleCounts$} from '#sepal/ee/samplingDesign/validateSampleCounts'
import {swallow} from '#sepal/rxjs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'

export const exportRandomToAssets$ = ({taskId, description, recipe, assetId, strategy, destination, workspacePath, filenamePrefix, fileFormat, properties = {}}) => {
    const {model: {aoi, stratification, sampleAllocation: {allocation}, sampleArrangement}} = recipe

    return forkJoin({
        eeStratification: stratificationImage$(stratification),
        region: toGeometry$(aoi)
    }).pipe(
        switchMap(({eeStratification, region}) =>
            // Shared generation: adaptive density, thinning, sample + reproduction metadata.
            randomSamples$({allocation, eeStratification, region, sampleArrangement}).pipe(
                switchMap(featureCollection => {
                    const samples = featureCollection.set(formatProperties(properties))
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
        )
    )
}
