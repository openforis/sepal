const ee = require('sepal/ee')

const createCollection = (
    {
        startDate,
        endDate,
        geometry,
        cloudThreshold
    }) => {
    return mergedCollection()
        .filter(filter({geometry, startDate, endDate}))
        .select(
            ['B', 'G', 'R', 'N'],
            ['blue', 'green', 'red', 'nir']
        )
        .map(function (image) {
            const ndvi = image
                .normalizedDifference(['nir', 'red'])
                .multiply(10000)
                .rename('ndvi')
            return image
                .addBands(brightness(image))
                .addBands(ndvi)
                .updateMask(cloudScore(image).lte(cloudThreshold))
        })
}

const hasImagery = ({geometry, startDate, endDate}) =>
    mergedCollection()
        .filter(filter({geometry, startDate, endDate}))
        .isEmpty()
        .not()

const mergedCollection = () => ee.ImageCollection('projects/planet-nicfi/assets/basemaps/africa')
    .merge(ee.ImageCollection('projects/planet-nicfi/assets/basemaps/asia'))
    .merge(ee.ImageCollection('projects/planet-nicfi/assets/basemaps/americas'))

const filter = ({geometry, startDate, endDate}) =>
    ee.Filter.and(
        ee.Filter.bounds(geometry),
        ee.Filter.gte('system:time_start', ee.Date(startDate).millis()),
        ee.Filter.lte('system:time_end', ee.Date(endDate).millis())
    )

const brightness = image => image.select(['red', 'green', 'blue'])
    .pow(2)
    .reduce(ee.Reducer.sum())
    .sqrt()
    .rename('brightness')

const unitScaleClamp = (image, low, high) => image
    .subtract(low)
    .divide(high - low)
    .clamp(0, 1)

const cloudScore = image => {
    image = image.divide(10000)
    var score = ee.Image(1)
    var blueScore = ee.Image(0)

    // Clouds are reasonably bright in the blue.
    blueScore = blueScore.max(unitScaleClamp(image.select('blue'), 0.1, 0.5))
    score = score.min(blueScore)

    // Clouds are reasonably bright in all visible bands.
    score = score.min(
        unitScaleClamp(ee.Image().expression('i.red + i.green + i.blue', {i: image}), 0.2, 0.8)
    )

    // Clouds are reasonably bright in infrared bands.
    score = score.min(
        unitScaleClamp(ee.Image().expression('i.nir', {i: image}), 0.1, 0.27)
    )
    return score
}

module.exports = {createCollection, hasImagery}
