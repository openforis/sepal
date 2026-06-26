import {forkJoin, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ImageFactory from '#sepal/ee/imageFactory'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {stratifiedRandomSample} from './randomSampling.js'

export const exportRandomToAssets$ = ({taskId, description, recipe, assetId, strategy, destination, format, properties = {}}) => {
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
