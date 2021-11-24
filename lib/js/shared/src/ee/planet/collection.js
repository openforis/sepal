const ee = require('sepal/ee')
const bufferClouds = require('../optical/imageProcess/bufferClouds')
const {processDailyCollection} = require('./daily')
const {processBasemapCollection} = require('./basemap')

const createCollection = (
    {
        startDate,
        endDate,
        geometry,
        sources,
        histogramMatching,
        cloudThreshold,
        cloudBuffer
    }) => {
    return mergedCollection({geometry, startDate, endDate, sources, histogramMatching})
        .map(function (image) {
            if (sources.source === 'DAILY' && histogramMatching !== 'ENABLED') {
                return image.int16()
            } else {
                const cloud = cloudScore(image).gt(cloudThreshold)
                    .rename('cloud')
                const bufferedClouds = cloudBuffer > 0 ? bufferClouds(cloudBuffer)(cloud) : cloud
                return image
                    .addBands(brightness(image))
                    .int16()
                    .updateMask(bufferedClouds.not())
            }
        })
}

const hasImagery = ({geometry, startDate, endDate, sources}) =>
    mergedCollection({geometry, startDate, endDate, sources, histogramMatching: 'DISABLED'})
        .filter(filter({geometry, startDate, endDate}))
        .isEmpty()
        .not()

const mergedCollection = ({geometry, startDate, endDate, sources, histogramMatching}) => {
    const collection = sources.assets.reduce(
        (acc, asset) => acc.merge(ee.ImageCollection(asset)
            .filter(filter({geometry, startDate, endDate}))),
        ee.ImageCollection([])
    )
    return sources.source === 'DAILY'
        ? processDailyCollection({
            collection,
            geometry,
            startDate,
            endDate,
            histogramMatching
        })
        : processBasemapCollection(collection)
}

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
