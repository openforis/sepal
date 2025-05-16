const {job} = require('#gee/jobs/job')

const MAX_PIXELS = 1e5
const MAX_VALUE_COUNT = 256

const worker$ = ({
    requestArgs: {recipe, band, aoi, mapBounds}
}) => {
    const ImageFactory = require('#sepal/ee/imageFactory')
    const ee = require('#sepal/ee/ee')
    const {switchMap, tap} = require('rxjs')
    const {toGeometry$} = require('#sepal/ee/aoi')

    const {getImage$} = ImageFactory(recipe, {selection: [band]})

    return toGeometry$(aoi).pipe(
        switchMap(aoiGeometry => {
            const distinctValues = image => {
                const imageGeometry = image.select(band).geometry()
                const mapGeometry = ee.Geometry.Rectangle(mapBounds)
                const geometry = ee.Algorithms.If(
                    image.select(band).geometry().isUnbounded(),
                    aoi
                        ? ee.Algorithms.If(
                            aoi.type === 'ASSET_BOUNDS' ? false : aoiGeometry.intersects(imageGeometry),
                            aoiGeometry,
                            mapGeometry
                        )
                        : mapGeometry,
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
                    .slice(0, MAX_VALUE_COUNT)
        
            }
        
            return getImage$().pipe(
                switchMap(image => ee.getInfo$(distinctValues(image), 'recipe histogram')),
                tap(values => {
                    if (values.length >= MAX_VALUE_COUNT) {
                        throw Error('Too many distinct values in image. Is this really a categorical image?')
                    }
                })
            )
        })
    )
}

module.exports = job({
    jobName: 'Distinct band values',
    jobPath: __filename,
    worker$
})
