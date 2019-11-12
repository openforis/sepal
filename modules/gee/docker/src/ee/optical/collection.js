const ee = require('@google/earthengine')
const _ = require('lodash')
const moment = require('moment')
const dataSetSpecs = require('./dataSetSpecs')
const imageProcessor = require('./imageProcessor')

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
        compositeOptions: {
            corrections = [],
            mask = null,
            cloudBuffer = null
        } = {}
    }) => {
    const filter = ee.Filter.and(
        ee.Filter.bounds(region),
        dateFilter({seasonStart, seasonEnd, yearsBefore, yearsAfter})
    )
    return dataSets.reduce((mergedCollection, dataSet) =>
            mergeImageCollections(
                mergedCollection,
                createCollection({dataSet, reflectance, filter})
            ),
        ee.ImageCollection([])
    )
}

const dateFilter = ({seasonStart, seasonEnd, yearsBefore, yearsAfter}) => {
    const dateFormat = 'YYYY-MM-DD'
    const filter = (yearDelta) =>
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

const selectedScenes = ({reflectance, scenes}) =>
    _.chain(scenes)
        .values()
        .flatten()
        .groupBy('dataSet')
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

const createCollectionWithScenes = ({dataSet, reflectance, ids}) =>
    createCollection({dataSet, reflectance, filter: ee.Filter.inList('system:index', ids)})

const createCollection = ({dataSet, reflectance, filter}) => {
    const spec = dataSetSpecs[reflectance][dataSet]
    return ee.ImageCollection(spec.name)
        .filter(filter)
        .map(imageProcessor({spec}))
}

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
