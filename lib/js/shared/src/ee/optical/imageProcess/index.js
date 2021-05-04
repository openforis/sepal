const ee = require('ee')
const _ = require('lodash')

const addMissingBands = require('./addMissingBands')
const addIndexes = require('./addIndexes')
const addSnow = require('./addSnow')
const addWater = require('./addWater')
const addShadowScore = require('./addShadowScore')
const addHazeScore = require('./addHazeScore')
const addSoil = require('./addSoil')
const addCloud = require('./addCloud')
const applyBRDFCorrection = require('./applyBRDFCorrection')
const applyPanSharpening = require('./applyPanSharpening')
const addDates = require('./addDates')
const applyQA = require('./applyQA')
const bufferClouds = require('./bufferClouds')
const pino26 = require('./pino26')

const imageProcess = ({bands, calibrate, brdfCorrect, cloudMasking, cloudBuffer, reflectance, snowMasking, panSharpen, targetDate}) => {
    return image =>
        compose(
            normalize(),
            applyQA(cloudMasking),
            addMissingBands(),
            addIndexes(),
            addSnow(),
            addWater(),
            addShadowScore(),
            addHazeScore(reflectance),
            addSoil(),
            pino26(), // Add clouds using cloud scoring
            // cloudMasking === 'AGGRESSIVE' && addCloud(), // Add clouds using cloud scoring
            cloudBuffer > 0 && bufferClouds(cloudBuffer),
            // snowMasking !== 'OFF' && maskSnow(),
            cloudMasking !== 'OFF' && maskClouds(cloudMasking),
            calibrate && reflectance === 'TOA' && calibrateBands(),
            brdfCorrect && applyBRDFCorrection(),
            panSharpen && bands.includes('pan') && applyPanSharpening(),
            toInt16(),
            addDates(targetDate),
            updateMask()
        )(image)
}

const normalize = () => {
    return image => {
        const dataSetSpec = ee.Dictionary(image.get('dataSetSpec'))
        const bands = ee.Dictionary(dataSetSpec.get('bands'))
        const fromBands = bands.values().map(band => ee.Dictionary(band).getString('name'))
        const toBands = bands.keys()
        const bandsToConvertToFloat = toBands
            .map(bandName => {
                const scaled = ee.Dictionary(bands.get(bandName)).get('scaled')
                return ee.Algorithms.If(scaled, bandName, null)
            }, true)
        return image
            .select(fromBands, toBands)
            .updateBands(bandsToConvertToFloat, image => image.divide(10000))
    }
}

const calibrateBands = () =>
    image => {
        const coefs = ee.Dictionary(
            ee.Dictionary(
                image.get('dataSetSpec')
            ).get('calibrationCoefs')
        )
        const slopes = ee.Image.constant(ee.List(coefs.get('slopes')))
        const intercepts = ee.Image.constant(ee.List(coefs.get('intercepts')))
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

const toInt16 = () =>
    image => image
        .multiply(ee.Image(10000))
        .int16()

const updateMask = () =>
    image => image
        .updateMask(
            image.mask().reduce(ee.Reducer.min()).not().not()
        )

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
