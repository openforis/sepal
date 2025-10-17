const ee = require('#sepal/ee/ee')
const _ = require('lodash')
const moment = require('moment')
const dataSetSpecs = require('./dataSetSpecs.json')
const imageProcess = require('./imageProcess')
const preventHoles = require('./maaskPreventingHoles')
const maskShadows = require('./maskShadows')
const applyPercentileFilter = require('./applyPercentileFilter')
const {compose} = require('../functional')
const {prepareSentinel2Collection} = require('./sentinel2Collection')

module.exports = {allScenes, selectedScenes, hasImagery, findCommonBands}

const BAND_BY_FILTER = {
    SHADOW: 'shadowScore',
    HAZE: 'hazeScore',
    NDVI: 'ndvi',
    DAY_OF_YEAR: 'targetDayCloseness'
}

function allScenes({
    geometry,
    dates: {targetDate, seasonStart, seasonEnd, yearsBefore = 0, yearsAfter = 0} = {},
    dataSets,
    reflectance = 'TOA',
    calibrate,
    brdfCorrect,
    brdfMultiplier,
    cloudPercentageThreshold = 100,
    includedCloudMasking = [],
    sentinel2CloudProbabilityMaxCloudProbability,
    sentinel2CloudScorePlusBand,
    sentinel2CloudScorePlusMaxCloudProbability,
    landsatCFMaskCloudMasking,
    landsatCFMaskCloudShadowMasking,
    landsatCFMaskCirrusMasking,
    landsatCFMaskDilatedCloud,
    sepalCloudScoreMaxCloudProbability,
    holes,
    cloudBuffer,
    shadowMasking = 'OFF',
    snowMasking,
    orbitOverlap,
    tileOverlap,
    filters,
    panSharpen
}) {
    const filter = ee.Filter.and(
        ee.Filter.bounds(geometry),
        dateFilter({seasonStart, seasonEnd, yearsBefore, yearsAfter})
    )

    const bands = findCommonBands(dataSets, reflectance)
    return dataSets.reduce(
        (mergedCollection, dataSet) =>
            mergeImageCollections(
                mergedCollection,
                createCollection({
                    bands,
                    dataSet,
                    reflectance,
                    filter,
                    calibrate,
                    brdfCorrect,
                    brdfMultiplier,
                    filters,
                    cloudPercentageThreshold,
                    includedCloudMasking,
                    sentinel2CloudProbabilityMaxCloudProbability,
                    sentinel2CloudScorePlusBand,
                    sentinel2CloudScorePlusMaxCloudProbability,
                    landsatCFMaskCloudMasking,
                    landsatCFMaskCloudShadowMasking,
                    landsatCFMaskCirrusMasking,
                    landsatCFMaskDilatedCloud,
                    sepalCloudScoreMaxCloudProbability,
                    holes,
                    cloudBuffer,
                    shadowMasking,
                    snowMasking,
                    orbitOverlap,
                    tileOverlap,
                    panSharpen,
                    targetDate
                })
            ),
        ee.ImageCollection([])
    )
}

function selectedScenes({
    reflectance, calibrate, brdfCorrect, brdfMultiplier, filters,
    cloudPercentageThreshold, includedCloudMasking,
    sentinel2CloudProbabilityMaxCloudProbability, sentinel2CloudScorePlusBand, sentinel2CloudScorePlusMaxCloudProbability,
    landsatCFMaskCloudMasking, landsatCFMaskCloudShadowMasking, landsatCFMaskCirrusMasking, landsatCFMaskDilatedCloud,
    sepalCloudScoreMaxCloudProbability, holes, cloudBuffer,
    shadowMasking = 'OFF', snowMasking, orbitOverlap, tileOverlap, panSharpen, targetDate, scenes
}) {
    const scenesByDataSet = _.chain(scenes)
        .flatten()
        .groupBy('dataSet')
        .value()

    return _.chain(scenesByDataSet)
        .mapValues(scenes => scenes.map(scene => toEEId(scene))
        )
        .mapValues((ids, dataSet) => createCollectionWithScenes({dataSet, reflectance, ids})
        )
        .values()
        .reduce(
            (acc, collection) => mergeImageCollections(acc, collection),
            ee.ImageCollection([])
        )
        .value()

    function createCollectionWithScenes({dataSet, reflectance, ids}) {
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
            brdfMultiplier,
            filters,
            cloudPercentageThreshold,
            includedCloudMasking,
            sentinel2CloudProbabilityMaxCloudProbability,
            sentinel2CloudScorePlusBand,
            sentinel2CloudScorePlusMaxCloudProbability,
            landsatCFMaskCloudMasking,
            landsatCFMaskCloudShadowMasking,
            landsatCFMaskCirrusMasking,
            landsatCFMaskDilatedCloud,
            sepalCloudScoreMaxCloudProbability,
            holes,
            cloudBuffer,
            shadowMasking,
            snowMasking,
            orbitOverlap,
            tileOverlap,
            panSharpen,
            targetDate
        })
    }
}

function hasImagery({dataSets, reflectance, geometry, startDate, endDate}) {
    return dataSets
        .map(dataSet => ee.ImageCollection(dataSetSpecs[reflectance][dataSet].collectionName)
            .filterDate(startDate, endDate)
            .filterBounds(geometry)
        )
        .reduce(mergeImageCollections, ee.ImageCollection([]))
        .isEmpty()
        .not()
}

function findCommonBands(dataSets, reflectance) {
    const allBands = dataSets
        .map(dataSetName => dataSetSpecs[reflectance][dataSetName])
        .map(dataSet => Object.keys(dataSet.bands))
    const dateBands = ['unixTimeDays', 'dayOfYear', 'daysFromTarget', 'targetDayCloseness']
    return [..._.intersection(...allBands), ...dateBands]
}

function dateFilter({seasonStart, seasonEnd, yearsBefore, yearsAfter}) {
    const dateFormat = 'YYYY-MM-DD'
    const filter = yearDelta => ee.Filter.date(
        moment(seasonStart).add(yearDelta, 'years').format(dateFormat),
        moment(seasonEnd).add(yearDelta, 'years').format(dateFormat)
    )

    return ee.Filter.or(...[
        filter(0),
        _.range(0, yearsBefore).map(i => filter(i - 1)),
        _.range(0, yearsAfter).map(i => filter(i + 1))
    ].flat())
}

function createCollection({
    bands, dataSet, reflectance, filter, calibrate, brdfCorrect, brdfMultiplier, filters,
    cloudPercentageThreshold, includedCloudMasking = [],
    sentinel2CloudProbabilityMaxCloudProbability, sentinel2CloudScorePlusBand, sentinel2CloudScorePlusMaxCloudProbability,
    landsatCFMaskCloudMasking, landsatCFMaskCloudShadowMasking, landsatCFMaskCirrusMasking, landsatCFMaskDilatedCloud,
    sepalCloudScoreMaxCloudProbability, holes, cloudBuffer,
    shadowMasking, snowMasking, orbitOverlap, tileOverlap, panSharpen, targetDate
}) {
    const dataSetSpec = dataSetSpecs[reflectance][dataSet]
    const collection = toUnprocessedCollection()
    return processCollection({
        bands,
        dataSetSpec,
        collection,
        reflectance,
        calibrate,
        brdfCorrect,
        brdfMultiplier,
        filters,
        includedCloudMasking,
        sentinel2CloudProbabilityMaxCloudProbability,
        sentinel2CloudScorePlusBand,
        sentinel2CloudScorePlusMaxCloudProbability,
        landsatCFMaskCloudMasking,
        landsatCFMaskCloudShadowMasking,
        landsatCFMaskCirrusMasking,
        landsatCFMaskDilatedCloud,
        sepalCloudScoreMaxCloudProbability,
        holes,
        cloudBuffer,
        shadowMasking,
        snowMasking,
        orbitOverlap,
        tileOverlap,
        panSharpen,
        targetDate
    })

    function toUnprocessedCollection() {
        const cloudCoverProperty = dataSet === 'SENTINEL_2'
            ? 'CLOUDY_PIXEL_PERCENTAGE'
            : 'CLOUD_COVER'
        const cloudFilter = cloudPercentageThreshold === 100
            ? filter
            : ee.Filter.and(filter, ee.Filter.lte(cloudCoverProperty, cloudPercentageThreshold))
        const collection = (dataSetSpec.filters || []).reduce(
            (collection, [property, operator, value]) => collection.filterMetadata(property, operator, value),
            ee.ImageCollection(dataSetSpec.collectionName).filter(cloudFilter)
        )
        if (dataSet === 'SENTINEL_2') {
            return prepareSentinel2Collection({
                collection, filter, tileOverlap, includedCloudMasking, sentinel2CloudScorePlusBand
            })

        } else {
            return collection
        }
    }
}

function processCollection({
    bands, dataSetSpec, collection, reflectance, calibrate, brdfCorrect, brdfMultiplier, filters, includedCloudMasking,
    sentinel2CloudProbabilityMaxCloudProbability, sentinel2CloudScorePlusBand, sentinel2CloudScorePlusMaxCloudProbability,
    landsatCFMaskCloudMasking, landsatCFMaskCloudShadowMasking, landsatCFMaskCirrusMasking, landsatCFMaskDilatedCloud,
    sepalCloudScoreMaxCloudProbability, holes, cloudBuffer,
    shadowMasking, snowMasking, orbitOverlap, tileOverlap, panSharpen, targetDate
}) {
    const mappedCollection = collection
        .map(imageProcess({
            bands,
            dataSetSpec,
            calibrate,
            brdfCorrect,
            brdfMultiplier,
            includedCloudMasking,
            sentinel2CloudProbabilityMaxCloudProbability,
            sentinel2CloudScorePlusBand,
            sentinel2CloudScorePlusMaxCloudProbability,
            landsatCFMaskCloudMasking,
            landsatCFMaskCloudShadowMasking,
            landsatCFMaskCirrusMasking,
            landsatCFMaskDilatedCloud,
            sepalCloudScoreMaxCloudProbability,
            holes,
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
        // When preventing masked out pixels, only mask clouds when there is at least one cloud-free pixel
        // Otherwise, clouds are masked when processing individual images
        holes === 'PREVENT' && preventHoles(snowMasking),
        ...filters.map(applyFilter)
    ).select(bands)
}

function removeOrbitOverlap() {
    return collection => {
        const preferredOrbit = collection
            .select('orbit')
            .reduce(ee.Reducer.mode())
        return collection.map(function (image) {
            return image.updateMask(
                image.select('orbit').eq(preferredOrbit)
            )
        })
    }
}

function removeTileOverlap() {
    return collection => {
        const preferredTile = collection
            .select('tile')
            .reduce(ee.Reducer.min())
        return collection.map(function (image) {
            return image.updateMask(
                image.select('tile').eq(preferredTile)
            )
        })
    }
}

function applyFilter(filter) {
    return applyPercentileFilter(BAND_BY_FILTER[filter.type], filter.percentile)
}

function toEEId({id, dataSet, date}) {
    return dataSet === 'SENTINEL_2'
        ? id
        : toEELandsatId({id, date})
}

function toEELandsatId({id, date}) {
    return [
        id.substring(0, 4),
        id.substring(10, 16),
        moment(date, 'YYYY-MM-DD').format('YYYYMMDD')
    ].join('_')
}

function mergeImageCollections(c1, c2) {
    return ee.ImageCollection(c1.merge(c2))
}
