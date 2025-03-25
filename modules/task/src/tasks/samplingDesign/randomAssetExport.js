const ImageFactory = require('sepal/src/ee/imageFactory')
const {toGeometry$} = require('#sepal/ee/aoi')
const {forkJoin, switchMap} = require('rxjs')
const ee = require('#sepal/ee')
const _ = require('lodash')
const {tableToAsset$} = require('#task/jobs/export/tableToAsset')
const {toId, toColor} = require('./featureProperties')

module.exports = {
    exportRandomToAssets: ({taskId, description, recipe, assetId, strategy}) => {
        const {model: {
            aoi,
            stratification,
            sampleAllocation: {allocation},
            sampleArrangement
        }} = recipe
        const stratificationRecipe = stratification.type === 'RECIPE'
            ? {type: 'RECIPE_REF', id: stratification.recipeId}
            : {type: 'ASSET', id: stratification.assetId}

        const bandName = stratification.band
        const stratification$ = ImageFactory(stratificationRecipe, {selection: [bandName]}).getImage$()
        const geometry$ = toGeometry$(aoi)

        var crs = 'EPSG:4326'
        var crsTransform = null
        var projection = crs
            ? ee.Projection(crs, crsTransform)
            : null

        return forkJoin({
            stratification: stratification$,
            region: geometry$
        }).pipe(
            switchMap(({stratification, region}) => {
                var classValues = allocation.map(function (allocation) {
                    return allocation.stratum
                })
                var classPoints = allocation.map(function (allocation) {
                    return allocation.sampleSize
                })
                var allocationCollection = ee.FeatureCollection(allocation
                    .map(function (stratum) {
                        return ee.Feature(null, stratum)
                    })
                )
                
                var samples = stratification
                    .select([bandName], ['stratum'])
                    .int()
                    .stratifiedSample({
                        numPoints: 0,
                        classBand: 'stratum',
                        region: region,
                        scale: 10, // TODO: Parameterize
                        projection: projection,
                        seed: 1, // TODO: Parameterize
                        classValues: classValues,
                        classPoints: classPoints,
                        geometries: true
                    })
                    .map(function (sample) {
                        return sample
                            .set('id', toId({sample}))
                            .set('color', toColor({sample, allocationCollection}))
                    })

                return tableToAsset$({
                    taskId,
                    collection: setProperties(samples),
                    description,
                    assetId,
                    strategy
                })
            })
        )

        function setProperties(collection) {
            return collection
                .set('allocation', JSON.stringify(allocation, null, 2))
                .set('sampleArrangement', JSON.stringify(sampleArrangement, null, 2))
                .set('stratification', JSON.stringify(stratificationRecipe, null, 2))
        }

    }
}
