import {forkJoin, map, of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {validateSampleCounts$} from '#sepal/ee/samplingDesign/validateSampleCounts'
import {fileName} from '#sepal/path'

// Server-rendered preview of the Sampling Design samples: builds the finalized FeatureCollection with the
// shared generation logic, styles it, and returns an ee.getMap$ tile layer. Features are never sent to
// the browser (no getInfo on features). Bounds come from the AOI geometry.
//
// Callers must pass the canonical task recipe (toTaskRecipe(recipe)), the same shape export submits, so
// preview and export sample the identical allocation rows.
const worker$ = ({
    requestArgs: {recipe, color = '#ffffff', fillColor = '#ffff0080', pointSize = 4}
}) => {
    const allocation = recipe?.model?.sampleAllocation?.allocation || []
    const sampleArrangement = recipe?.model?.sampleArrangement || {}
    // Same final count guard as export: RANDOM and SYSTEMATIC OVER/EXACT must reach the requested count;
    // SYSTEMATIC CLOSEST may undershoot but must not be empty. Fail clearly rather than render an
    // under-produced sample set as if it were valid.
    const requireFull = !(sampleArrangement.arrangementStrategy === 'SYSTEMATIC' && sampleArrangement.sampleSizeStrategy === 'CLOSEST')

    return ImageFactory(recipe).getFeatures$().pipe(
        switchMap(features => {
            if (!features) {
                return of(null)
            }
            return validateSampleCounts$(features, allocation, {requireFull}).pipe(
                switchMap(() => {
                    const styled = features.style({color, fillColor, pointSize, width: 1})
                    return forkJoin({
                        bounds: bounds$(recipe.model.aoi),
                        eeMap: ee.getMap$(styled, null, 'create sampling design samples map')
                    }).pipe(
                        map(({bounds, eeMap}) => bounds ? {bounds, ...eeMap} : eeMap)
                    )
                })
            )
        })
    )
}

const bounds$ = aoi =>
    toGeometry$(aoi).pipe(
        switchMap(geometry => {
            if (!geometry) {
                return of(null)
            }
            const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))
            return ee.getInfo$(
                ee.List([boundsPolygon.get(0), boundsPolygon.get(2)]),
                'sampling design samples bounds'
            )
        })
    )

export default job({
    jobName: 'Sampling design samples map',
    jobPath: fileName(import.meta.url),
    worker$
})
