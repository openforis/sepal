const ee = require('#sepal/ee')
const _ = require('lodash')
const moment = require('moment')
const dataSetSpecs = require('./dataSetSpecs.json')
const imageProcess = require('./imageProcess')
const maskClouds = require('./maskClouds')
const maskShadows = require('./maskShadows')
const applyPercentileFilter = require('./applyPercentileFilter')
const {compose} = require('../functional')

const allScenes = (
    {
        geometry,
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
        cloudPercentageThreshold = 100,
        cloudDetection,
        cloudMasking,
        cloudBuffer,
        shadowMasking = 'OFF',
        snowMasking,
        orbitOverlap,
        tileOverlap,
        filters,
        panSharpen
    }) => {
    const filter = ee.Filter.and(
        ee.Filter.bounds(geometry),
        dateFilter({seasonStart, seasonEnd, yearsBefore, yearsAfter})
    )

    const bands = findCommonBands(dataSets, reflectance)
    return dataSets.reduce((mergedCollection, dataSet) =>
        mergeImageCollections(
            mergedCollection,
            createCollection({
                bands,
                dataSet,
                reflectance,
                filter,
                calibrate,
                brdfCorrect,
                filters,
                cloudPercentageThreshold,
                cloudDetection,
                cloudMasking,
                cloudBuffer,
                shadowMasking,
                snowMasking,
                orbitOverlap,
                tileOverlap,
                panSharpen,
                targetDate})
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
        _.range(0, yearsAfter).map(i => filter(i + 1))
    ].flat())
}

const selectedScenes = (
    {
        reflectance,
        calibrate,
        brdfCorrect,
        filters,
        cloudPercentageThreshold,
        cloudDetection,
        cloudMasking,
        cloudBuffer,
        shadowMasking = 'OFF',
        snowMasking,
        orbitOverlap,
        tileOverlap,
        panSharpen,
        targetDate,
        scenes
    }) => {
    const scenesByDataSet = _.chain(scenes)
        .flatten()
        .groupBy('dataSet')
        .value()

    const createCollectionWithScenes = ({dataSet, reflectance, ids}) => {
        const filter = ee.Filter.inList('system:index', ids)
        const dataSets = Object.keys(scenesByDataSet)
        const bands = findCommonBands(dataSets, reflectance)
        return createCollection({
            bands,
            dataSet,
            reflectance,
            filter,
            calibrate,
            brdfCorrect,
            filters,
            cloudPercentageThreshold,
            cloudDetection,
            cloudMasking,
            cloudBuffer,
            shadowMasking,
            snowMasking,
            orbitOverlap,
            tileOverlap,
            panSharpen,
            targetDate
        })
    }

    return _.chain(scenesByDataSet)
        .mapValues(scenes =>
            scenes.map(scene => toEEId(scene))
        )
        .mapValues((ids, dataSet) =>
            createCollectionWithScenes({dataSet, reflectance, ids})
        )
        .values()
        .reduce(
            (acc, collection) => mergeImageCollections(acc, collection),
            ee.ImageCollection([])
        )
        .value()
}

const createCollection = ({
    bands,
    dataSet,
    reflectance,
    filter,
    calibrate,
    brdfCorrect,
    filters,
    cloudPercentageThreshold,
    cloudDetection,
    cloudMasking,
    cloudBuffer,
    shadowMasking,
    snowMasking,
    orbitOverlap,
    tileOverlap,
    panSharpen,
    targetDate
}) => {
    const cloudCoverProperty = dataSet === 'SENTINEL_2'
        ? 'CLOUDY_PIXEL_PERCENTAGE'
        : 'CLOUD_COVER'
    const cloudFilter = cloudPercentageThreshold === 100
        ? filter
        : ee.Filter.and(filter, ee.Filter.lte(cloudCoverProperty, cloudPercentageThreshold))
    const dataSetSpec = dataSetSpecs[reflectance][dataSet]
    const toUnprocessedCollection = () => {
        const collection = (dataSetSpec.filters || []).reduce(
            (collection, [property, operator, value]) => collection.filterMetadata(property, operator, value),
            ee.ImageCollection(dataSetSpec.collectionName).filter(cloudFilter)
        )
        if (dataSet === 'SENTINEL_2') {
            const clouds = ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY')
                .filter(filter)
            const withCloudProbability = ee.ImageCollection(ee.Join.saveFirst('cloudProbability').apply({
                primary: collection,
                secondary: clouds,
                condition:
                        ee.Filter.equals({leftField: 'system:index', rightField: 'system:index'})
            }))
            const clipCollection = () => {
                const tiles = ee.FeatureCollection('users/wiell/SepalResources/sentinel2TilesNoOverlapBuffered')
                return ee.ImageCollection(
                    ee.Join.saveFirst('tile').apply({
                        primary: withCloudProbability,
                        secondary: tiles,
                        condition:
                        ee.Filter.equals({leftField: 'MGRS_TILE', rightField: 'name'})
                    })
                ).map(image => {
                    const tile = ee.Feature(image.get('tile'))
                    return image.clip(tile.geometry())
                })
            }
            return ['QUICK_REMOVE', 'REMOVE'].includes(tileOverlap)
                ? clipCollection()
                : withCloudProbability

        } else {
            return collection
        }
    }

    return processCollection({
        bands,
        dataSetSpec,
        collection: toUnprocessedCollection(),
        reflectance,
        calibrate,
        brdfCorrect,
        filters,
        cloudDetection,
        cloudMasking,
        cloudBuffer,
        shadowMasking,
        snowMasking,
        orbitOverlap,
        tileOverlap,
        panSharpen,
        targetDate
    })
}

const processCollection = (
    {
        bands,
        dataSetSpec,
        collection,
        reflectance,
        calibrate,
        brdfCorrect,
        filters,
        cloudDetection,
        cloudMasking,
        cloudBuffer,
        shadowMasking,
        snowMasking,
        orbitOverlap,
        tileOverlap,
        panSharpen,
        targetDate
    }) => {
    const mappedCollection = collection
        .map(imageProcess({
            bands,
            dataSetSpec,
            calibrate,
            brdfCorrect,
            cloudDetection,
            cloudMasking,
            cloudBuffer,
            reflectance,
            snowMasking,
            orbitOverlap,
            tileOverlap,
            panSharpen,
            targetDate
        }))
    return compose(
        mappedCollection,
        orbitOverlap === 'REMOVE' && removeOrbitOverlap(),
        tileOverlap === 'REMOVE' && removeTileOverlap(),
        shadowMasking !== 'OFF' && maskShadows(),
        // If cloudMasking isn't turned off, clouds are masked when processing individual images.
        // When it is turned off, only mask clouds when there is at least one cloud-free pixel
        cloudMasking === 'OFF' && maskClouds(),
        ...filters.map(applyFilter)
    ).select(bands)
}

const removeOrbitOverlap = () =>
    collection => {
        const preferredOrbit = collection
            .select('orbit')
            .reduce(ee.Reducer.mode())
        return collection.map(function (image) {
            return image.updateMask(
                image.select('orbit').eq(preferredOrbit)
            )
        })
    }

const removeTileOverlap = () =>
    collection => {
        const preferredTile = collection
            .select('tile')
            .reduce(ee.Reducer.min())
        return collection.map(function (image) {
            return image.updateMask(
                image.select('tile').eq(preferredTile)
            )
        })
    }

const findCommonBands = (dataSets, reflectance) => {
    const allBands = dataSets
        .map(dataSetName => dataSetSpecs[reflectance][dataSetName])
        .map(dataSet => Object.keys(dataSet.bands))
    const dateBands = ['unixTimeDays', 'dayOfYear', 'daysFromTarget', 'targetDayCloseness']
    return [..._.intersection(...allBands), ...dateBands]
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

const hasImagery = ({dataSets, reflectance, geometry, startDate, endDate}) =>
    dataSets
        .map(dataSet =>
            ee.ImageCollection(dataSetSpecs[reflectance][dataSet].collectionName)
                .filterDate(startDate, endDate)
                .filterBounds(geometry)
        )
        .reduce(mergeImageCollections, ee.ImageCollection([]))
        .isEmpty()
        .not()

module.exports = {allScenes, selectedScenes, hasImagery, findCommonBands}
