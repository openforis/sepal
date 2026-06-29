import moment from 'moment'
import {catchError, concat, EMPTY, filter, forkJoin, map, of, switchMap, throwError} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {swallow} from '#sepal/rxjs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {stratificationImage$} from './stratificationImage.js'
import {filterSamples, stratifiedSystematicSample} from './systematicSampling.js'

// Systematic sampling materializes the unfiltered samples to a temporary EE table asset, then reads it
// back to filter. GEE asset export derives the temp id from the target assetId; SEPAL export has no
// assetId, so create a temp id under the user's first EE asset root (same discovery as toAsset.js) with
// a safe generated name - never the user-facing description.
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
    const {model: {
        aoi,
        stratification,
        sampleAllocation: {allocation},
        sampleArrangement
    }} = recipe
    const eeStratification$ = stratificationImage$(stratification)
    const eeGeometry$ = toGeometry$(aoi)

    return tempTableAssetId$(taskId, assetId).pipe(
        switchMap(tempAssetId =>
            forkJoin({
                eeStratification: eeStratification$,
                eeGeometry: eeGeometry$
            }).pipe(
                switchMap(({eeStratification, eeGeometry}) => concat(
                    exportUnfilteredSamples$({eeStratification, eeGeometry, tempAssetId}),
                    exportFilteredSamples$({eeGeometry, tempAssetId}),
                    deleteUnfilteredSamples$(tempAssetId)
                )),
                catchError(error => concat(
                    deleteUnfilteredSamples$(tempAssetId),
                    throwError(() => error)
                ))
            )
        )
    )

    function exportUnfilteredSamples$({eeStratification, eeGeometry, tempAssetId}) {
        const samples = stratifiedSystematicSample({
            allocation: allocation,
            stratification: eeStratification,
            region: eeGeometry,
            minDistance: sampleArrangement.minDistance,
            scale: sampleArrangement.scale,
        })

        return tableToAsset$({
            taskId,
            collection: samples,
            description: `${description}_unfiltered`,
            assetId: tempAssetId
        }).pipe(
            filter(({state}) => state !== 'COMPLETED')
        )
    }

    function exportFilteredSamples$({eeGeometry, tempAssetId}) {
        const filteredSamples = filterSamples({
            region: eeGeometry,
            samples: ee.FeatureCollection(tempAssetId),
            allocation,
            strategy: sampleArrangement.sampleSizeStrategy,
            seed: sampleArrangement.seed
        }).set(formatProperties(properties))
        return destination === 'SEPAL'
            ? tableToSepal$(taskId, {
                collection: filteredSamples,
                description,
                workspacePath,
                filenamePrefix,
                fileFormat,
                selectors: ['id', 'stratum', 'color']
            })
            : tableToAsset$({
                taskId,
                collection: filteredSamples,
                description,
                assetId,
                strategy
            })
    }

    function deleteUnfilteredSamples$(tempAssetId) {
        return ee.deleteAsset$(tempAssetId).pipe(
            catchError(() => EMPTY),
            swallow()
        )
    }
}
