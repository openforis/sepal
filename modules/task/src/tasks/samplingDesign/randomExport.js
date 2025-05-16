const ImageFactory = require('#sepal/ee/imageFactory')
const {toGeometry$} = require('#sepal/ee/aoi')
const {forkJoin, switchMap} = require('rxjs')
const _ = require('lodash')
const {tableToAsset$} = require('#task/jobs/export/tableToAsset')
const {tableToSepal$} = require('#task/jobs/export/tableToSepal')
const {formatProperties} = require('../formatProperties')
const {stratifiedRandomSample} = require('./randomSampling')

module.exports = {
    exportRandomToAssets$: ({taskId, description, recipe, assetId, strategy, destination, format, properties = {}}) => {
        const {model: {
            aoi,
            stratification,
            sampleAllocation: {allocation},
            sampleArrangement: {
                minDistance,
                scale,
                crs,
                crsTransform,
                seed
            }
        }} = recipe
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
                var samples = stratifiedRandomSample({
                    allocation,
                    stratification: stratification.select(bandName),
                    region,
                    scale,
                    minDistance,
                    crs,
                    crsTransform,
                    seed
                }).set(formatProperties(properties))

                return destination === 'SEPAL'
                    ? tableToSepal$({ // TODO: Figure out the parameters
                        taskId,
                        collection: samples,
                        description,
                        format
                    })
                    : tableToAsset$({
                        taskId,
                        collection: samples,
                        description,
                        assetId,
                        strategy
                    })
            })
        )
    }
}
