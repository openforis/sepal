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

const imageProcess = ({dataSetSpec, calibrate, brdfCorrect, cloudMasking, cloudBuffer, snowMasking, panSharpen, targetDate}) => {
    const bands = dataSetSpec.bands
    const fromBands = Object.values(bands).map(band => band.name)
    const toBands = Object.keys(bands)
    const bandsToConvertToFloat = _.chain(bands)
        .pickBy(({scaled}) => scaled)
        .keys()
        .value()
    const qaBand = bands.qa.name
    return image =>
        compose(
            normalize(fromBands, toBands, bandsToConvertToFloat),
            applyQA(toBands, qaBand),
            addMissingBands(),
            addIndexes(),
            addSnow(),
            addWater(),
            addShadowScore(),
            addHazeScore(dataSetSpec.reflectance),
            addSoil(),
            cloudMasking === 'AGGRESSIVE' && addCloud(),
            cloudBuffer > 0 && bufferClouds(cloudBuffer),
            snowMasking !== 'OFF' && maskSnow(),
            cloudMasking !== 'OFF' && maskClouds(cloudMasking),
            calibrate && dataSetSpec.calibrationCoefs && calibrateBands(dataSetSpec.calibrationCoefs),
            brdfCorrect && applyBRDFCorrection(dataSetSpec),
            panSharpen && toBands.includes('pan') && applyPanSharpening(),
            addDates(targetDate),
            toInt16(),
            updateMask()
        )(image)
}

const normalize = (fromBands, toBands, bandsToConvertToFloat) =>
    image => image
        .select(fromBands, toBands)
        .updateBands(bandsToConvertToFloat, image => image.divide(10000))

const calibrateBands = coefs =>
    image =>
        image.addBands(
            image
                .select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2'])
                .multiply(coefs.slopes).add(coefs.intercepts).float(),
            null, true
        )

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
