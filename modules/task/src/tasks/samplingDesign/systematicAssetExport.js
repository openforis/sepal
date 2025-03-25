const ImageFactory = require('sepal/src/ee/imageFactory')
const {toGeometry$} = require('#sepal/ee/aoi')
const {swallow} = require('#sepal/rxjs')
const {catchError, concat, filter, forkJoin, switchMap} = require('rxjs')
const {stratifiedSystematicSample, filterSamples} = require('./stratifiedSampling')
const ee = require('#sepal/ee')
const moment = require('moment')
const _ = require('lodash')
const {tableToAsset$} = require('#task/jobs/export/tableToAsset')

module.exports = {
    exportSystematicToAssets: ({taskId, description, recipe, assetId, strategy}) => {
        const {model: {
            aoi,
            stratification,
            sampleAllocation: {allocation},
            sampleArrangement
        }} = recipe
        const tempAssetId = `${assetId}_${moment().format('YYYYMMDDHHmmssSSS')}`
        const stratificationRecipe = stratification.type === 'RECIPE'
            ? {type: 'RECIPE_REF', id: stratification.recipeId}
            : {type: 'ASSET', id: stratification.assetId}

        return concat(
            exportUnfilteredSamples$(),
            exportFilteredSamples$(),
            deleteUnfilteredSamples$()
        ).pipe(
            catchError(() => deleteUnfilteredSamples$())
        )

        function exportUnfilteredSamples$() {
            const bandName = stratification.band
            const eeStratification$ = ImageFactory(stratificationRecipe, {selection: [bandName]}).getImage$()
            const eeGeometry$ = toGeometry$(aoi)

            return forkJoin({
                eeStratification: eeStratification$,
                eeGeometry: eeGeometry$
            }).pipe(
                switchMap(({eeStratification, eeGeometry}) => {
                    const samples = stratifiedSystematicSample({
                        allocation: allocation,
                        stratification: eeStratification.select(bandName).rename('stratum'),
                        region: eeGeometry,
                        minDistance: 100, // TODO: Parameterize
                        scale: 10, // TODO: Parameterize
                    })

                    return tableToAsset$({
                        taskId,
                        collection: samples,
                        description: `${description}_unfiltered`,
                        assetId: tempAssetId
                    })
                }),
                filter(({state}) => state !== 'COMPLETED')
            )
        }

        function exportFilteredSamples$() {
            const filteredSamples = filterSamples({
                samples: ee.FeatureCollection(tempAssetId),
                allocation,
                strategy: 'CLOSEST' // TODO: Should be a parameter in the model
            })
            return tableToAsset$({
                taskId,
                collection: setProperties(filteredSamples),
                description,
                assetId,
                strategy
            })
        }

        function setProperties(collection) {
            return collection
                .set('allocation', JSON.stringify(allocation, null, 2))
                .set('sampleArrangement', JSON.stringify(sampleArrangement, null, 2))
                .set('stratification', JSON.stringify(stratificationRecipe, null, 2))
        }

        function deleteUnfilteredSamples$() {
            return ee.deleteAsset$(tempAssetId).pipe(swallow())
        }
    }
}
