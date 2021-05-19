const {job} = require('root/jobs/job')

const MAX_BUCKETS = Math.pow(2, 8)
const MAX_PIXELS = 1e5

const worker$ = ({recipe, band, aoi}) => {
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('ee')
    const {switchMap} = require('rx/operators')
    const {toGeometry} = require('sepal/ee/aoi')

    const {getImage$} = ImageFactory(recipe, {selection: [band]})
    const histogram = image => {
        const geometry = aoi
            ? toGeometry(aoi)
            : image.select(band).geometry()
        return image.select(band).reduceRegion({
            reducer: ee.Reducer.autoHistogram(MAX_BUCKETS),
            geometry,
            scale: 1,
            bestEffort: true,
            maxPixels: MAX_PIXELS
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
