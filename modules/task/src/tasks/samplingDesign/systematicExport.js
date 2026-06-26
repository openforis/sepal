import moment from 'moment'
import {catchError, concat, filter, forkJoin, switchMap, throwError} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {swallow} from '#sepal/rxjs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {filterSamples, stratifiedSystematicSample} from './systematicSampling.js'

export const exportSystematicToAssets$ = ({taskId, description, recipe, assetId, strategy, properties, destination, format}) => {
    const {model: {
        aoi,
        stratification,
        sampleAllocation: {allocation},
        sampleArrangement
    }} = recipe
    const tempAssetId = `${assetId}_${moment().format('YYYYMMDDHHmmssSSS')}`
    const bandName = stratification.band
    const stratificationRecipe = stratification.type === 'RECIPE'
        ? {type: 'RECIPE_REF', id: stratification.recipeId}
        : {type: 'ASSET', id: stratification.assetId}
    const eeStratification$ = ImageFactory(stratificationRecipe, {selection: [bandName]}).getImage$()
    const eeGeometry$ = toGeometry$(aoi)

    return forkJoin({
        eeStratification: eeStratification$,
        eeGeometry: eeGeometry$
    }).pipe(
        switchMap(({eeStratification, eeGeometry}) => concat(
            exportUnfilteredSamples$({eeStratification, eeGeometry}),
            exportFilteredSamples$({eeGeometry}),
            deleteUnfilteredSamples$()
        ),
        ),
        catchError(error => concat(
            deleteUnfilteredSamples$(),
            throwError(() => error)
        )
        )
    )

    function exportUnfilteredSamples$({eeStratification, eeGeometry}) {
        const samples = stratifiedSystematicSample({
            allocation: allocation,
            stratification: eeStratification.select(bandName).rename('stratum'),
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

    function exportFilteredSamples$({eeGeometry}) {
        const filteredSamples = filterSamples({
            region: eeGeometry,
            samples: ee.FeatureCollection(tempAssetId),
            allocation,
            strategy: sampleArrangement.sampleSizeStrategy,
            seed: sampleArrangement.seed
        }).set(formatProperties(properties))
        return destination === 'SEPAL'
            ? tableToSepal$({ // TODO: Figure out the parameters
                taskId,
                collection: filteredSamples,
                description,
                format
            })
            : tableToAsset$({
                taskId,
                collection: filteredSamples,
                description,
                assetId,
                strategy
            })
    }

    function deleteUnfilteredSamples$() {
        return ee.deleteAsset$(tempAssetId).pipe(swallow())
    }
}
