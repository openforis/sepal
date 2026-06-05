import {job} from '#gee/jobs/job'
import ImageFactory from '#sepal/ee/imageFactory'
import ee from '#sepal/ee/ee'
import {switchMap} from 'rxjs'
import {toGeometry} from '#sepal/ee/aoi'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)

const MAX_BUCKETS = Math.pow(2, 8)
const MAX_PIXELS = 1e5

const worker$ = ({
    requestArgs: {recipe, band, aoi, mapBounds}
}) => {

    const {getImage$, histogramMaxPixels} = ImageFactory(recipe, {selection: [band]})
    const histogram = image => {
        const imageGeometry = image.select(band).geometry()
        const mapGeometry = ee.Geometry.Rectangle(mapBounds)
        const geometry = ee.Algorithms.If(
            image.select(band).geometry().isUnbounded(),
            aoi
                ? ee.Algorithms.If(
                    aoi.type === 'ASSET_BOUNDS' ? false : toGeometry(aoi).intersects(imageGeometry),
                    toGeometry(aoi),
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

    return getImage$().pipe(
        switchMap(image =>
            ee.getInfo$(histogram(image), 'recipe histogram')
        )
    )
}

export default job({
    jobName: 'EE image histogram',
    jobPath: __filename,
    worker$
})
