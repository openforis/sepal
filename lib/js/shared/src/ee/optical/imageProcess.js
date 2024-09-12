const ee = require('#sepal/ee')

const addMissingBands = require('./imageProcess/addMissingBands')
const addIndexes = require('./imageProcess/addIndexes')
const addSnow = require('./imageProcess/addSnow')
const addWater = require('./imageProcess/addWater')
const addShadowScore = require('./imageProcess/addShadowScore')
const addHazeScore = require('./imageProcess/addHazeScore')
const addSoil = require('./imageProcess/addSoil')
const addCloud = require('./imageProcess/addCloud')
const applyBRDFCorrection = require('./imageProcess/applyBRDFCorrection')
const applyPanSharpening = require('./imageProcess/applyPanSharpening')
const addDates = require('./imageProcess/addDates')
const applyQA = require('./imageProcess/applyQA')
const bufferClouds = require('./imageProcess/bufferClouds')
const pino26 = require('./imageProcess/pino26')

const imageProcess = ({bands, dataSetSpec, calibrate, brdfCorrect, cloudDetection = [], cloudMasking, cloudBuffer, reflectance, snowMasking, orbitOverlap, tileOverlap, panSharpen, targetDate}) => {
    const sentinel2 = dataSetSpec.dataSetName === 'SENTINEL_2'
    return image =>
        compose(
            normalize(dataSetSpec),
            applyQA(cloudDetection, cloudMasking, dataSetSpec),
            addMissingBands(),
            addIndexes(),
            addSnow(),
            addWater(),
            addShadowScore(cloudMasking),
            addHazeScore(reflectance),
            addSoil(),
            cloudDetection.includes('CLOUD_SCORE') && addCloud(cloudMasking),
            cloudDetection.includes('PINO_26') && pino26(),
            cloudBuffer > 0 && bufferClouds(cloudBuffer),
            snowMasking !== 'OFF' && maskSnow(),
            cloudMasking !== 'OFF' && maskClouds(cloudMasking),
            calibrate && reflectance === 'TOA' && calibrateBands(dataSetSpec),
            brdfCorrect && applyBRDFCorrection(dataSetSpec),
            panSharpen && bands.includes('pan') && applyPanSharpening(),
            toInt16(),
            addDates(targetDate),
            sentinel2 && orbitOverlap === 'REMOVE' && addOrbit(),
            sentinel2 && tileOverlap === 'REMOVE' && addTile(),
        )(image)
}

const normalize = dataSetSpec =>
    image => {
        const bands = dataSetSpec.bands
        const fromBands = Object.values(bands).map(({name}) => name)
        const toBands = Object.keys(bands)
        const scaledImage = Object.values(bands).reduce(
            (image, {name, scale = 1, offset = 0}) => {
                const band = image.select(name)
                const scaledBand = band.multiply(scale).add(offset)
                return image.addBands(scaledBand, null, true)
            },
            image
        )
        return scaledImage
            .select(fromBands, toBands)
            .set('dataSetSpec', dataSetSpec)
    }

const calibrateBands = dataSetSpec =>
    image => {
        const coefs = dataSetSpec.calibrationCoefs
        const slopes = ee.Image.constant(ee.List(coefs.slopes))
        const intercepts = ee.Image.constant(ee.List(coefs.intercepts))
        return image.addBands(
            image
                .select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2'])
                .multiply(slopes).add(intercepts).float(),
            null, true
        )
    }

const maskSnow = () =>
    image => image.updateMask(
        image.select('snow').not()
    )

const maskClouds = () =>
    image => image.updateMask(
        image.select('cloud').not()
    )

const addOrbit = () =>
    image => {
        const orbit = ee.Image(
            image.getNumber('SENSING_ORBIT_NUMBER')
        )
            .uint8()
            .updateMask(image.select(0).mask().eq(1))
            .rename('orbit')
        return image.addBands(orbit)
    }
    
const addTile = () =>
    image => {
        var tiles = ee.FeatureCollection('users/wiell/SepalResources/sentinel2SceneAreas')
        var names = tiles.aggregate_array('name')
        var numberOfTiles = tiles.size()
        var indexes = ee.List.sequence(0, numberOfTiles.subtract(1))
        var indexByTile = ee.Dictionary.fromLists(names, indexes)
        const tile = ee.Image(
            indexByTile.getNumber(image.getString('MGRS_TILE'))
        )
            .uint16()
            .updateMask(image.select(0).mask().eq(1))
            .rename('tile')
        return image.addBands(tile)
    }
    
const toInt16 = () =>
    image => image
        .multiply(ee.Image(10000))
        .int16()

const compose = (...operations) =>
    image =>
        operations
            .filter(operation => operation)
            .reduce(
                (image, operation) => image.select([]).addBands(
                    operation(image)
                ),
                image
            )

module.exports = imageProcess
