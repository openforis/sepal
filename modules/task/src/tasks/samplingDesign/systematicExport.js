const ImageFactory = require('#sepal/ee/imageFactory')
const {toGeometry$} = require('#sepal/ee/aoi')
const {swallow} = require('#sepal/rxjs')
const {catchError, concat, filter, forkJoin, switchMap, throwError} = require('rxjs')
const {stratifiedSystematicSample, filterSamples} = require('./systematicSampling')
const ee = require('#sepal/ee/ee')
const moment = require('moment')
const _ = require('lodash')
const {tableToAsset$} = require('#task/jobs/export/tableToAsset')
const {tableToSepal$} = require('#task/jobs/export/tableToSepal')
const {formatProperties} = require('../formatProperties')

module.exports = {
    exportSystematicToAssets$: ({taskId, description, recipe, assetId, strategy, properties, destination, format}) => {
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
}
