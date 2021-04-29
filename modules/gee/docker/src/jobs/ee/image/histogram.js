const {job} = require('root/jobs/job')

const MAX_BUCKETS = Math.pow(2, 8)
const MAX_PIXELS = 1e5

const worker$ = ({recipe, band}) => {
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('ee')
    const {switchMap} = require('rx/operators')

    const {getImage$} = ImageFactory(recipe, {selection: [band]})

    const histogram = image =>
        image.select(band).reduceRegion({
            reducer: ee.Reducer.autoHistogram(MAX_BUCKETS),
            scale: 1,
            bestEffort: true,
            maxPixels: MAX_PIXELS
        }).get(band)

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
