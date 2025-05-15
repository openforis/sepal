const {job} = require('#gee/jobs/job')

const MAX_BUCKETS = Math.pow(2, 8)
const MAX_PIXELS = 1e5

const worker$ = ({
    requestArgs: {recipe, band, aoi, mapBounds}
}) => {
    const ImageFactory = require('#sepal/ee/imageFactory')
    const ee = require('#sepal/ee/ee')
    const {switchMap} = require('rxjs')
    const {toGeometry} = require('#sepal/ee/aoi')

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

module.exports = job({
    jobName: 'EE image histogram',
    jobPath: __filename,
    worker$
})
