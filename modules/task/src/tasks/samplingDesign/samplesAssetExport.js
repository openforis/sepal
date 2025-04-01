const ImageFactory = require('sepal/src/ee/imageFactory')
const {toGeometry$} = require('#sepal/ee/aoi')
const {setWorkloadTag} = require('../workloadTag')
const {swallow} = require('#sepal/rxjs')
const {concat, forkJoin, of, switchMap, takeLast, tap} = require('rxjs')
const {stratifiedSystematicSample, filterSamples} = require('./stratifiedSampling')
const {exportLimiter$} = require('#task/jobs/service/exportLimiter')
const {task$} = require('#task/ee/task')
const ee = require('#sepal/ee')
const moment = require('moment')
const _ = require('lodash')

module.exports = {
    submit$: (taskId, {description, recipe, assetId, strategy}) => {
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
            tap(console.log)
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
            console.log('filtering samples')
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
