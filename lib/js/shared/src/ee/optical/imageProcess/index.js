const ee = require('sepal/ee')

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

const imageProcess = ({bands, dataSetSpec, calibrate, brdfCorrect, cloudDetection = [], cloudMasking, cloudBuffer, reflectance, snowMasking, panSharpen, targetDate}) => {
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
            addDates(targetDate)
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
