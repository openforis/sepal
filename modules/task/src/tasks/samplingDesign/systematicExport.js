import moment from 'moment'
import {catchError, concat, EMPTY, filter, forkJoin, map, of, switchMap, throwError} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {SYSTEMATIC_EXPORT_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {chooseSystematicUnfiltered$, finalizeSystematicSamples} from '#sepal/ee/samplingDesign/samples'
import {stratificationImage$} from '#sepal/ee/samplingDesign/stratificationImage'
import {filterSamples} from '#sepal/ee/samplingDesign/systematicSampling'
import {validateSampleCounts$} from '#sepal/ee/samplingDesign/validateSampleCounts'
import {swallow} from '#sepal/rxjs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'

// Systematic export materializes the chosen unfiltered samples to a temporary EE table asset, then reads
// it back to filter. GEE asset export derives the temp id from the target assetId; SEPAL export has no
// assetId, so create a temp id under the user's first EE asset root with a safe generated name.
const tempTableAssetId$ = (taskId, assetId) => {
    const timestamp = moment().format('YYYYMMDDHHmmssSSS')
    if (assetId) {
        return of(`${assetId}_${timestamp}`)
    }
    return ee.listBuckets$('projects/earthengine-legacy').pipe(
        map(({assets}) => {
            if (!assets?.length) {
                throw new Error('EE account has no asset roots')
            }
            return `${assets[0].id}/sampling_design_tmp_${taskId}_${timestamp}`
        })
    )
}

export const exportSystematicToAssets$ = ({taskId, description, recipe, assetId, strategy, properties, destination, workspacePath, filenamePrefix, fileFormat}) => {
    const {model: {aoi, stratification, sampleAllocation: {allocation}, sampleArrangement}} = recipe
    // CLOSEST may intentionally land below the target; OVER/EXACT must reach the requested count.
    const requireFull = sampleArrangement.sampleSizeStrategy !== 'CLOSEST'

    return tempTableAssetId$(taskId, assetId).pipe(
        switchMap(tempAssetId =>
            forkJoin({
                eeStratification: stratificationImage$(stratification),
                eeGeometry: toGeometry$(aoi)
            }).pipe(
                switchMap(({eeStratification, eeGeometry}) =>
                    // Shared adaptive density selection; the export then materializes the chosen unfiltered
                    // collection to a temp asset and filters it back.
                    chooseSystematicUnfiltered$({allocation, eeStratification, region: eeGeometry, sampleArrangement}).pipe(
                        switchMap(({unfilteredSamples, densityOffset}) => concat(
                            exportUnfilteredSamples$({unfilteredSamples, tempAssetId}),
                            exportFilteredSamples$({eeGeometry, tempAssetId, densityOffset}),
                            deleteUnfilteredSamples$(tempAssetId)
                        ))
                    )
                ),
                catchError(error => concat(
                    deleteUnfilteredSamples$(tempAssetId),
                    throwError(() => error)
                ))
            )
        )
    )

    function exportUnfilteredSamples$({unfilteredSamples, tempAssetId}) {
        return tableToAsset$({
            taskId,
            collection: unfilteredSamples,
            description: `${description}_unfiltered`,
            assetId: tempAssetId
        }).pipe(
            filter(({state}) => state !== 'COMPLETED')
        )
    }

    function exportFilteredSamples$({eeGeometry, tempAssetId, densityOffset}) {
        const filteredSamples = filterSamples({
            region: eeGeometry,
            samples: ee.FeatureCollection(tempAssetId),
            allocation,
            strategy: sampleArrangement.sampleSizeStrategy,
            seed: sampleArrangement.seed
        })
        const samples = finalizeSystematicSamples({filteredSamples, allocation, sampleArrangement, densityOffset})
            .set(formatProperties(properties))
        const export$ = destination === 'SEPAL'
            ? tableToSepal$(taskId, {
                collection: samples,
                description,
                workspacePath,
                filenamePrefix,
                fileFormat,
                selectors: SYSTEMATIC_EXPORT_PROPERTY_NAMES
            })
            : tableToAsset$({
                taskId,
                collection: samples,
                description,
                assetId,
                strategy
            })
        // Final guard after adaptive densification: OVER/EXACT must reach the requested count; CLOSEST
        // may undershoot but must not be empty.
        return concat(
            validateSampleCounts$(samples, allocation, {requireFull}).pipe(swallow()),
            export$
        )
    }

    function deleteUnfilteredSamples$(tempAssetId) {
        return ee.deleteAsset$(tempAssetId).pipe(
            catchError(() => EMPTY),
            swallow()
        )
    }
}
