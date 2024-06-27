const ee = require('#sepal/ee')
const bufferClouds = require('../optical/imageProcess/bufferClouds')
const {processDailyCollection} = require('./daily')
const {processBasemapCollection} = require('./basemap')
const applyPercentileFilter = require('#sepal/ee/optical/applyPercentileFilter')
const moment = require('moment')

const MILLIS_PER_DAY = 1000 * 60 * 60 * 24

const NICFI_ASSETS = [
    'projects/planet-nicfi/assets/basemaps/africa',
    'projects/planet-nicfi/assets/basemaps/asia',
    'projects/planet-nicfi/assets/basemaps/americas'
]

const createCollection = (
    {
        targetDate,
        startDate,
        endDate,
        geometry,
        sources,
        histogramMatching,
        cloudThreshold,
        cloudBuffer
    }) => {
    const collection = mergedCollection({geometry, targetDate, startDate, endDate, sources, histogramMatching})
        .map(function (image) {
            const cloud = cloudScore(image).gt(cloudThreshold)
                .rename('cloud')
            const bufferedClouds = cloudBuffer > 0 ? bufferClouds(cloudBuffer)(cloud) : cloud
            return image
                .addBands(brightness(image))
                // .addBands(addDates(image, targetDate)) // TODO: addDates() somehow duplicates band names. Still, it doesn't make sense to include dates before we support mediod for Planet.
                .int16()
                .updateMask(bufferedClouds.not())
        })
    const percentile = targetDate ? 100 : 0
    return applyPercentileFilter('targetDayCloseness', percentile)(collection)
}

const hasImagery = ({geometry, startDate, endDate, sources}) =>
    mergedCollection({geometry, startDate, endDate, sources, histogramMatching: 'DISABLED'})
        .filter(filter({geometry, startDate, endDate}))
        .isEmpty()
        .not()

const mergedCollection = ({geometry, startDate, endDate, sources, histogramMatching}) => {
    const assets = sources.source === 'NICFI'
        ? NICFI_ASSETS
        : sources.assets
    const collection = assets.reduce(
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
    var blueCirrusScore = ee.Image(0)
    var blueScore = ee.Image(0)


    // Clouds are reasonably bright in the blue or cirrus bands.
    // Use .max as a pseudo OR conditional
    blueCirrusScore = blueCirrusScore.max(unitScaleClamp(image.select('blue'), 0.1, 0.5))
    blueCirrusScore = blueCirrusScore.max(unitScaleClamp(image.addBands(ee.Image(0).rename('aerosol')).select('aerosol'), 0.1, 0.5))

    // Clouds are reasonably bright in the blue.
    score = score.min(blueCirrusScore)

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

const addDates = (image, targetDate) =>
    image.compose(
        dayOfYear(),
        daysFromTarget(targetDate),
        targetDayCloseness(),
        unixTimeDays()
    )

const dayOfYear = () =>
    image =>
        ee.Image(
            image.date().getRelative('day', 'year')
        ).int16().rename('dayOfYear').updateMask(image.select(0).mask())

const daysFromTarget = targetDate =>
    image => {
        if (!targetDate)
            return ee.Image(0)
                .int16()
                .rename('daysFromTarget')
        const targetDay = parseInt(moment(targetDate, 'YYYY-MM-DD').format('DDD'))
        const delta = image
            .selfExpression('abs(targetDay - i.dayOfYear)', {targetDay})
            .rename('delta')
        return delta
            .selfExpression('min(i.delta, 365 - i.delta)')
            .int16()
            .rename('daysFromTarget')
            .updateMask(image.select(0).mask())
    }

const targetDayCloseness = () =>
    image => image
        .select('daysFromTarget')
        .multiply(-1)
        .int16()
        .rename('targetDayCloseness')
        .updateMask(image.select(0).mask())
    
const unixTimeDays = () =>
    image =>
        ee.Image(
            image.date().millis().divide(MILLIS_PER_DAY)
        ).int16().rename('unixTimeDays').updateMask(image.select(0).mask())

module.exports = {createCollection, hasImagery}
