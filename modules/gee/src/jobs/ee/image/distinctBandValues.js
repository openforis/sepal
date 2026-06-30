import {forkJoin, of, switchMap, tap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'

const MAX_PIXELS = 1e5
const MAX_VALUE_COUNT = 256

const worker$ = ({
    requestArgs: {recipe, band, aoi, mapBounds}
}) => {

    const {getImage$} = ImageFactory(recipe, {selection: [band]})
    // Resolve the AOI to an EE geometry up front: ASSET/RECIPE AOIs need an async lookup (the sync
    // toGeometry returns the raw object for those, which can't be used as a geometry). ASSET_BOUNDS can't
    // be resolved without source-image context, so it's left to the mapBounds / image-geometry fallback.
    const aoiGeometry$ = aoi && aoi.type !== 'ASSET_BOUNDS'
        ? toGeometry$(aoi)
        : of(null)

    const distinctValues = (image, aoiGeometry) => {
        const imageGeometry = image.select(band).geometry()
        // Fallback region when the image is unbounded: prefer the map rectangle, then the resolved AOI,
        // then the image geometry. mapBounds is optional (callers without a live map omit it).
        const mapGeometry = mapBounds ? ee.Geometry.Rectangle(mapBounds) : null
        const fallbackGeometry = mapGeometry || aoiGeometry || imageGeometry
        const geometry = ee.Algorithms.If(
            imageGeometry.isUnbounded(),
            aoiGeometry
                ? ee.Algorithms.If(
                    aoiGeometry.intersects(imageGeometry),
                    aoiGeometry,
                    fallbackGeometry
                )
                : fallbackGeometry,
            imageGeometry
        )

        const minMax = image.reduceRegion({
            reducer: ee.Reducer.minMax(),
            geometry,
            scale: 1,
            bestEffort: true,
            maxPixels: MAX_PIXELS,
            tileScale: 16
        })
        const min = minMax.getNumber(`${band}_min`).floor()
        const max = minMax.getNumber(`${band}_max`).ceil()
        const histogram = image.reduceRegion({
            reducer: ee.Reducer.fixedHistogram({
                min,
                max: max.add(1),
                steps: max.add(1).subtract(min).round().int()
            }),
            geometry,
            scale: 1,
            bestEffort: true,
            maxPixels: MAX_PIXELS,
            tileScale: 16
        })
        const array = ee.Array(histogram.get(band))
        return array
            .mask(array.slice(1, 1, 2))
            .slice(1, 0, 1)
            .project([0])
            .toList()
            // One past the limit so the "too many values" guard below is reachable - otherwise a
            // continuous/non-categorical band would silently return the first MAX_VALUE_COUNT values.
            .slice(0, MAX_VALUE_COUNT + 1)

    }

    return forkJoin({
        image: getImage$(),
        aoiGeometry: aoiGeometry$
    }).pipe(
        switchMap(({image, aoiGeometry}) => ee.getInfo$(distinctValues(image, aoiGeometry), 'recipe histogram')),
        tap(values => {
            if (values.length > MAX_VALUE_COUNT) {
                throw Error('Too many distinct values in image. Is this really a categorical image?')
            }
        })
    )
}

export default job({
    jobName: 'Distinct band values',
    jobPath: fileName(import.meta.url),
    worker$
})
