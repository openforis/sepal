const ee = require('@google/earthengine')
const _ = require('lodash')
const moment = require('moment')
const dataSetSpecs = require('./dataSetSpecs')
const imageProcess = require('./imageProcess')
const maskClouds = require('./maskClouds')
const applyPercentileFilter = require('./applyPercentileFilter')

const allScenes = (
    {
        region,
        dates: {
            targetDate,
            seasonStart,
            seasonEnd,
            yearsBefore = 0,
            yearsAfter = 0
        } = {},
        dataSets,
        reflectance = 'TOA',
        calibrate,
        brdfCorrect,
        cloudMasking,
        cloudBuffer,
        snowMasking,
        filters,
        panSharpen
    }) => {
    const filter = ee.Filter.and(
        ee.Filter.bounds(region),
        dateFilter({seasonStart, seasonEnd, yearsBefore, yearsAfter})
    )

    return dataSets.reduce((mergedCollection, dataSet) =>
        mergeImageCollections(
            mergedCollection,
            createCollection({
                dataSet,
                reflectance,
                calibrate,
                brdfCorrect,
                filters,
                cloudMasking,
                cloudBuffer,
                snowMasking,
                panSharpen,
                targetDate,
                filter
            }).select(findCommonBands(dataSets, reflectance))
        ),
    ee.ImageCollection([])
    )
}

const dateFilter = ({seasonStart, seasonEnd, yearsBefore, yearsAfter}) => {
    const dateFormat = 'YYYY-MM-DD'
    const filter = yearDelta =>
        ee.Filter.date(
            moment(seasonStart).add(yearDelta, 'years').format(dateFormat),
            moment(seasonEnd).add(yearDelta, 'years').format(dateFormat)
        )

    return ee.Filter.or(...[
        filter(0),
        _.range(0, yearsBefore).map(i => filter(i - 1)),
        _.range(0, yearsAfter).map(i => filter(i + 1)),
    ].flat())
}

const selectedScenes = ({reflectance, calibrate, brdfCorrect, filters, cloudMasking, cloudBuffer, snowMasking, panSharpen, targetDate, scenes}) => {
    const scenesByDataSet = _.chain(scenes)
        .values()
        .flatten()
        .groupBy('dataSet')
        .value()
    const dataSets = Object.keys(scenesByDataSet)
    return _.chain(scenesByDataSet)
        .mapValues(scenes =>
            scenes.map(scene => toEEId(scene))
        )
        .mapValues((ids, dataSet) =>
            createCollectionWithScenes({
                dataSet,
                reflectance,
                calibrate,
                brdfCorrect,
                filters,
                cloudMasking,
                cloudBuffer,
                snowMasking,
                panSharpen,
                targetDate,
                ids
            }).select(findCommonBands(dataSets, reflectance))
        )
        .values()
        .reduce(
            (acc, collection) => mergeImageCollections(acc, collection),
            ee.ImageCollection([])
        )
        .value()
}

const createCollectionWithScenes = ({dataSet, reflectance, calibrate, brdfCorrect, filters, cloudMasking, cloudBuffer, snowMasking, panSharpen, targetDate, ids}) => {
    const filter = ee.Filter.inList('system:index', ids)
    return createCollection({
        dataSet,
        reflectance,
        calibrate,
        brdfCorrect,
        filters,
        cloudMasking,
        cloudBuffer,
        snowMasking,
        panSharpen,
        targetDate,
        filter
    })
}

const createCollection = ({dataSet, reflectance, calibrate, brdfCorrect, filters, cloudMasking, cloudBuffer, snowMasking, panSharpen, targetDate, filter}) => {
    const dataSetSpec = dataSetSpecs[reflectance][dataSet]

    // const collection = ee.ImageCollection(dataSetSpec.collectionName)
    //     .filter(filter)
    // const image = ee.Image(collection.first())
    // const processedImage = imageProcess({dataSetSpec, reflectance, brdfCorrect, targetDate})(image)
    // return ee.ImageCollection([processedImage])

    const collection = ee.ImageCollection(dataSetSpec.collectionName)
        .filter(filter)
        .map(imageProcess({
            dataSetSpec,
            calibrate,
            brdfCorrect,
            cloudMasking,
            cloudBuffer,
            snowMasking,
            panSharpen,
            targetDate
        }))

    return collection.compose(
        cloudMasking === 'OFF' && maskClouds(),
        ...filters.map(applyFilter)
    )
}

const findCommonBands = (dataSets, reflectance) => {
    const allBands = dataSets
        .map(dataSetName => dataSetSpecs[reflectance][dataSetName])
        .map(dataSet => Object.keys(dataSet.bands))
    return _.intersection(...allBands)
}

const bandByFilter = {
    SHADOW: 'shadowScore',
    HAZE: 'hazeScore',
    NDVI: 'ndvi',
    DAY_OF_YEAR: 'targetDayCloseness'
}

const applyFilter = filter =>
    applyPercentileFilter(bandByFilter[filter.type], filter.percentile)

const toEEId = ({id, dataSet, date}) =>
    dataSet === 'SENTINEL_2'
        ? id
        : toEELandsatId({id, date})

const toEELandsatId = ({id, date}) =>
    [
        id.substring(0, 2),
        '0',
        id.substring(2, 3),
        '_',
        id.substring(3, 9),
        '_',
        moment(date, 'YYYY-MM-DD').format('YYYYMMDD')
    ].join('')

const mergeImageCollections = (c1, c2) =>
    ee.ImageCollection(c1.merge(c2))

module.exports = {allScenes, selectedScenes}
