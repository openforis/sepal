import {defer, forkJoin, map, of, switchMap, tap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {systematicPreviewFeatures$, systematicPreviewImage$} from '#sepal/ee/samplingDesign/samples'
import {getLogger} from '#sepal/log'
import {fileName} from '#sepal/path'

const log = getLogger('ee')

// Systematic preview render mode. 'features' vectorizes only the SELECTED sample pixels into exact centroid
// points (crisp at any zoom); 'raster' renders an enlarged dot mask (no vectorizing). Both are kept so they
// can be compared - flip this to 'raster' to fall back. RANDOM always uses its (small) FeatureCollection.
const SYSTEMATIC_PREVIEW_MODE = 'features'

// Server-rendered preview of the Sampling Design samples, returned as an ee.getMap$ tile layer. Features
// are never sent to the browser. Bounds come from the AOI geometry.
//
// Render paths, all sharing the export density/level policy (no duplicated algorithm logic):
//   - SYSTEMATIC 'features': FeatureCollection of exact centroid points, vectorizing ONLY the selected
//     sample pixels (systematicPreviewFeatures$) - the mask cuts the count to ~requested before
//     reduceToVectors, avoiding the old full-candidate-grid vectorization that timed out.
//   - SYSTEMATIC 'raster': dot-mask image (systematicPreviewImage$) - no vectorizing at all.
//   - RANDOM: the finalized FeatureCollection (getFeatures$), styled. Random collections are small.
//
// Preview does NOT run the final sample-count validation (validateSampleCounts$): that needs an expensive
// getInfo over the finalized FeatureCollection and is redundant here - the GUI's validateRetrieve gates
// invalid designs before a preview is requested, and systematic density selection already scores from
// compact selected-level counts. Export stays strict (validateSampleCounts$; CLOSEST requireFull:false).
//
// Callers must pass the canonical task recipe (toTaskRecipe(recipe)), the same shape export submits, so
// preview and export sample the identical allocation rows.
const worker$ = ({
    requestArgs: {recipe, color = '#ffffff', fillColor = '#ffff0080', pointSize = 4}
}) => {
    const allocation = recipe?.model?.sampleAllocation?.allocation || []
    const sampleArrangement = recipe?.model?.sampleArrangement || {}
    const started = Date.now()
    const systematic = sampleArrangement.arrangementStrategy === 'SYSTEMATIC'

    log.info(`[sampling-design-preview] request start: ${requestSummary({recipe, allocation, sampleArrangement})}`)

    // Single-color dot palette for the raster path (hex, no '#', alpha dropped - palettes don't support it).
    const dotColor = (fillColor || color).replace('#', '').slice(0, 6)
    const styledFeatures = features => features && {eeObject: features.style({color, fillColor, pointSize, width: 1}), visParams: null}

    const systematicRenderable$ = SYSTEMATIC_PREVIEW_MODE === 'raster'
        ? timed$('getPreviewImage', () => systematicPreviewImage$(recipe.model, {dotRadius: pointSize})).pipe(
            map(image => image && {eeObject: image, visParams: {min: 1, max: 1, palette: [dotColor]}})
        )
        : timed$('getPreviewFeatures', () => systematicPreviewFeatures$(recipe.model)).pipe(map(styledFeatures))

    const renderable$ = systematic
        ? systematicRenderable$
        : timed$('getFeatures', () => ImageFactory(recipe).getFeatures$()).pipe(map(styledFeatures))

    return renderable$.pipe(
        switchMap(renderable => {
            if (!renderable) {
                log.info('[sampling-design-preview] nothing to render; recipe is not ready')
                return of(null)
            }
            return forkJoin({
                bounds: timed$('bounds', () => bounds$(recipe.model.aoi)),
                eeMap: timed$('getMapId', () => ee.getMap$(renderable.eeObject, renderable.visParams, 'create sampling design samples map'))
            }).pipe(
                map(({bounds, eeMap}) => bounds ? {bounds, ...eeMap} : eeMap)
            )
        }),
        tap({
            complete: () => log.info(`[sampling-design-preview] request complete (${elapsed(started)})`),
            error: error => log.warn(`[sampling-design-preview] request failed (${elapsed(started)}): ${error?.message || error}`)
        })
    )
}

const timed$ = (label, observableFactory) =>
    defer(() => {
        const started = Date.now()
        log.info(`[sampling-design-preview] ${label} start`)
        return observableFactory().pipe(
            tap({
                next: () => log.info(`[sampling-design-preview] ${label} done (${elapsed(started)})`),
                error: error => log.warn(`[sampling-design-preview] ${label} failed (${elapsed(started)}): ${error?.message || error}`)
            })
        )
    })

const requestSummary = ({recipe, allocation, sampleArrangement}) => [
    `recipe=${recipe?.id || recipe?.name || 'unknown'}`,
    `aoi=${recipe?.model?.aoi?.type || 'none'}`,
    `arrangement=${sampleArrangement.arrangementStrategy || 'none'}`,
    `strategy=${sampleArrangement.sampleSizeStrategy || 'none'}`,
    `allocationRows=${allocation.length}`,
    `requestedSamples=${requestedSamples(allocation)}`,
    `minDistance=${sampleArrangement.minDistance || ''}`,
    `scale=${sampleArrangement.scale || ''}`
].join(', ')

const requestedSamples = allocation =>
    allocation.reduce((sum, {sampleSize}) => sum + (Number(sampleSize) || 0), 0)

const elapsed = started => `${Date.now() - started}ms`

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
