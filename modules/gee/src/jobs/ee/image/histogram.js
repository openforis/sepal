import {of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'

const MAX_BUCKETS = Math.pow(2, 8)
const MAX_PIXELS = 1e5

const worker$ = ({
    requestArgs: {recipe, band, aoi, mapBounds}
}) => {

    const {getImage$, histogramMaxPixels} = ImageFactory(recipe, {selection: [band]})
    // ASSET_BOUNDS has no aoi geometry of its own; every other aoi is resolved before the geometry
    // selection below is composed.
    const aoiGeometry$ = aoi && aoi.type !== 'ASSET_BOUNDS'
        ? toGeometry$(aoi)
        : of(null)
    const histogram = (image, aoiGeometry) => {
        const imageGeometry = image.select(band).geometry()
        const mapGeometry = ee.Geometry.Rectangle(mapBounds)
        const geometry = ee.Algorithms.If(
            image.select(band).geometry().isUnbounded(),
            aoiGeometry
                ? ee.Algorithms.If(
                    aoiGeometry.intersects(imageGeometry),
                    aoiGeometry,
                    mapGeometry
                )
                : mapGeometry,
            imageGeometry
        )
        return image.select(band).reduceRegion({
            reducer: ee.Reducer.autoHistogram(MAX_BUCKETS),
            geometry,
            scale: 1,
            bestEffort: true,
            maxPixels: histogramMaxPixels || MAX_PIXELS,
            tileScale: 16
        }).get(band)
    }

    return aoiGeometry$.pipe(
        switchMap(aoiGeometry =>
            getImage$().pipe(
                switchMap(image =>
                    ee.getInfo$(histogram(image, aoiGeometry), 'recipe histogram')
                )
            )
        )
    )
}

export default job({
    jobName: 'EE image histogram',
    jobPath: fileName(import.meta.url),
    worker$
})
