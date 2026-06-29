import {forkJoin, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {stratifiedRandomSample} from './randomSampling.js'
import {stratificationImage$} from './stratificationImage.js'

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
    const stratification$ = stratificationImage$(stratification)
    const geometry$ = toGeometry$(aoi)

    return forkJoin({
        eeStratification: stratification$,
        region: geometry$
    }).pipe(
        switchMap(({eeStratification, region}) => {
            var samples = stratifiedRandomSample({
                allocation,
                stratification: eeStratification,
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
