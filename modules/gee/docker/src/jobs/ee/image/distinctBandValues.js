const {job} = require('root/jobs/job')

const MAX_PIXELS = 1e5
const MAX_VALUE_COUNT = 1000

const worker$ = ({recipe, band, aoi}) => {
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('ee')
    const {switchMap} = require('rx/operators')
    const {toGeometry} = require('sepal/ee/aoi')

    const {getImage$} = ImageFactory(recipe, {selection: [band]})
    const distinctValues = image => {
        const geometry = aoi
            ? toGeometry(aoi)
            : image.select(band).geometry()
        const minMax = image.reduceRegion({
            reducer: ee.Reducer.minMax(),
            geometry,
            scale: 1,
            bestEffort: true,
            maxPixels: MAX_PIXELS
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
            maxPixels: MAX_PIXELS
        })
        const array = ee.Array(histogram.get(band))
        return array
            .mask(array.slice(1, 1, 2))
            .slice(1, 0, 1)
            .project([0])
            .toList()
            .slice(0, MAX_VALUE_COUNT)

    }

    return getImage$().pipe(
        switchMap(image => {
            const values = ee.getInfo$(distinctValues(image), 'recipe histogram')
            if (values.length === MAX_VALUE_COUNT) {
                throw Error('Too many distinct values in image. Is this really a categorical image?')
            }
            return values
        })
    )
}

module.exports = job({
    jobName: 'Distinct band values',
    jobPath: __filename,
    worker$
})
