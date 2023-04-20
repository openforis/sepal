const ee = require('#sepal/ee')
const {compose} = require('../functional')
const {terrainCorrection} = require('./terrainCorrection')
const {addHarmonics, addHarmonicBands} = require('./harmonics')
const {handleOrbitOverlap} = require('./orbitOverlap')
const {createSpeckleStatsCollection} = require('./speckleStats')
const {removeOutliers} = require('./outiers')
const {maskBorder} = require('./borderMask')
const {applySpeckleFilter} = require('./speckleFilter')
const {addDateBands} = require('./dateBands')

const createCollection = ({
    startDate,
    endDate,
    targetDate,
    geometry,
    orbits = ['ASCENDING'],
    geometricCorrection = 'ELLIPSOID',
    outlierRemoval = 'NONE',
    orbitNumbers = 'ALL',
    spatialSpeckleFilter = 'NONE',
    kernelSize = 5,
    sigma = 0.9,
    strongScatterers = 'RETAIN',
    strongScattererValues = [0, -5],
    snicSize = 3,
    snicCompactness = 0.15,
    multitemporalSpeckleFilter = 'NONE',
    numberOfImages = 10,
    minNumberOfImages = 0,
    mask = ['SIDES', 'FIRST_LAST'],
    minAngle = 30.88,
    maxAngle = 45.35,
    minObservations = 1,
    harmonicDependents = [],
    fit = false
}) => {
    const bandNames = ['VV', 'VH']
    var collection = filteredCollection({geometry, orbits})
    const spatialSpeckleFilterOptions = {
        spatialSpeckleFilter,
        kernelSize,
        sigma,
        strongScatterers,
        strongScattererValues,
        snicSize,
        snicCompactness,
    }
    const applyMultitemporalSpeckleFilter = multitemporalSpeckleFilter && multitemporalSpeckleFilter !== 'NONE'
        && spatialSpeckleFilter && spatialSpeckleFilter !== 'NONE'
    var speckleStatsCollection = applyMultitemporalSpeckleFilter
        ? createSpeckleStatsCollection({
            collection,
            startDate,
            endDate,
            orbits,
            spatialSpeckleFilterOptions,
            multitemporalSpeckleFilter,
            numberOfImages,
            minNumberOfImages,
            bandNames
        })
        : null
    return compose(
        collection.filterDate(startDate, endDate),
        preProcessCollection(),
        handleOrbitOverlap({orbitNumbers, orbits}),
        removeOutliers({outlierRemoval, bandNames}),
        maskTooFewObservations(),
        addHarmonics({geometry, harmonicDependents, fit}),
    ).set('speckleStatsCollection', speckleStatsCollection)

    function preProcessCollection() {
        return collection => collection
            .map(image => compose(
                image,
                resample(),
                maskBorder({mask, minAngle, maxAngle}),
                applySpeckleFilter({spatialSpeckleFilterOptions, multitemporalSpeckleFilter, speckleStatsCollection, bandNames}),
                addDateBands({targetDate}),
                addRelativeOrbitNumber(),
                applyGeometricCorrection(image.select(bandNames[0]).projection()),
                addHarmonicBands({harmonicDependents}),
                toDb(),
                cast(),
            ))
    }

    function resample() {
        return image => image
            .resample()
            .updateMask(image.mask())

    }

    function maskTooFewObservations() {
        return collection => {
            if (minObservations <= 1) {
                return collection
            }
            const count = collection.select(0).reduce(ee.Reducer.count())
            return collection.map(image => image
                .updateMask(
                    count.gte(minObservations)
                )
            )
        }
    }
    
    function applyGeometricCorrection(projection) {
        return image => {
            const correction = {
                ELLIPSOID: toGamma0,
                TERRAIN: terrainCorrection
            }[geometricCorrection]
            return correction
                ? image.addBands(
                    correction(image, null, bandNames, projection), null, true
                )
                : image
        }
    }

    function toGamma0(image) {
        const gamma0 = image.expression('i/(cos(angle * pi / 180))', {
            'i': image.select(bandNames),
            'angle': image.select('angle'),
            'pi': Math.PI
        })
        return gamma0
    }

    function addRelativeOrbitNumber() {
        return image => image.addBands(
            ee.Image(image.getNumber('relativeOrbitNumber_start')).int16().rename('orbit')
                .updateMask(image.mask().reduce(ee.Reducer.min()))
        )
    }
    
    function toDb() {
        return image =>
            image.addBands(
                image.select(bandNames).log10().multiply(10), null, true
            )
    }

    function cast() {
        const intBandFilter = ee.Filter.inList('item', ['orbit', 'daysFromTarget', 'dayOfYear', 'unixTimeDays'])
        return image => image
            .select(image.bandNames().filter(intBandFilter.not()))
            .float()
            .addBands(image
                .select(image.bandNames().filter(intBandFilter))
                .int16()
            )
    }
}

const filteredCollection = ({geometry, orbits}) =>
    ee.ImageCollection('COPERNICUS/S1_GRD_FLOAT')
        .filter(ee.Filter.and(
            ee.Filter.bounds(geometry),
            ee.Filter.eq('instrumentMode', 'IW'),
            ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'),
            ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'),
            orbits.length > 1
                ? ee.Filter.or(
                    ee.Filter.eq('orbitProperties_pass', orbits[0]),
                    ee.Filter.eq('orbitProperties_pass', orbits[1])
                )
                : ee.Filter.eq('orbitProperties_pass', orbits[0])
        ))

const hasImagery = ({geometry, startDate, endDate, orbits}) =>
    filteredCollection({geometry, orbits})
        .filterDate(startDate, endDate)
        .isEmpty()
        .not()

module.exports = {createCollection, hasImagery}
