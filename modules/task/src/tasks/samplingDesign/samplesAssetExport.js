import ImageFactory from '#sepal/ee/imageFactory'
import {toGeometry$} from '#sepal/ee/aoi'
import {setWorkloadTag} from '../workloadTag.js'
import {swallow} from '#sepal/rxjs'
import {concat, forkJoin, of, switchMap, tap} from 'rxjs'
import {stratifiedSystematicSample, filterSamples} from './stratifiedSampling.js'
import {exportLimiter$} from '#task/jobs/service/exportLimiter'
import {task$} from '#task/ee/task'
import ee from '#sepal/ee/ee'
import moment from 'moment'
import _ from 'lodash'

export const submit$ = (taskId, {description, recipe, assetId, strategy}) => {
        setWorkloadTag(recipe)
        const {model: {
            aoi,
            stratification,
            sampleAllocation: {allocation}
        }} = recipe
        const tempAssetId = `${assetId}_${moment().format('YYYYMMDDHHmmssSSS')}`

        // TODO: Make some of this code reusable for sepal exports

        return concat(
            exportUnfilteredSamples$(),
            exportFilteredSamples$()

        ).pipe(
            tap(console.info)
            // Finally that delete tempAssetId
        )

        function exportUnfilteredSamples$() {
            const stratificationRecipe = stratification.type === 'RECIPE'
                ? {type: 'RECIPE_REF', id: stratification.recipeId}
                : {type: 'ASSET', id: stratification.assetId}
            const bandName = stratification.band
            const stratification$ = ImageFactory(stratificationRecipe, {selection: [bandName]}).getImage$()
            const geometry$ = toGeometry$(aoi)

            return forkJoin({
                stratification: stratification$,
                region: geometry$
            }).pipe(
                switchMap(({stratification, region}) => {
                    const samples = stratifiedSystematicSample({
                        allocation: allocation,
                        stratification: stratification.select(bandName).rename('stratum'),
                        region: region,
                        minDistance: 100,
                        scale: 10,
                    // strategy: 'CLOSEST'
                    })

                    return tableToAsset$({
                        taskId,
                        collection: samples,
                        description,
                        assetId: tempAssetId
                    })
                }),
            )
        }

        function exportFilteredSamples$() {
            console.info('filtering samples')
            const filteredSamples = filterSamples({
                samples: ee.FeatureCollection(tempAssetId),
                allocation,
                strategy: 'OVER' // TODO: Should be a parameter in the model
            })
            return tableToAsset$({
                taskId,
                collection: filteredSamples,
                description,
                assetId,
                strategy
            })
        }
    }

const tableToAsset$ = ({taskId, collection, description, assetId, strategy}) => {
    const serverConfig = ee.batch.Export.convertToServerParams(
        _.cloneDeep({collection, description, assetId}),
        ee.data.ExportDestination.ASSET,
        ee.data.ExportType.TABLE
    )
    const task = ee.batch.ExportTask.create(serverConfig)

    return exportLimiter$(
        concat(
            strategy === 'replace'
                ? ee.deleteAssetRecursive$(assetId, {include: ['ImageCollection', 'Image', 'Table']}).pipe(swallow())
                : of(),
            task$(taskId, task, description)
        )
    )
}
