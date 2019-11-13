const _ = require('lodash')

const addMissingBands = require('./addMissingBands')
const addIndexes = require('./addIndexes')
const addSnow = require('./addSnow')
const addHazeScore = require('./addHazeScore')
const applyQA = require('./applyQA')

const imageProcess = ({dataSetSpec, reflectance}) => {
    const bands = dataSetSpec.bands
    const fromBands = Object.values(bands).map(band => band.name)
    const toBands = Object.keys(bands)
    const bandsToConvertToFloat = _.chain(bands)
        .pickBy(({scaled}) => scaled)
        .keys()
        .value()

    return image =>
        compose(
            normalize(fromBands, toBands, bandsToConvertToFloat),
            applyQA(toBands),
            addMissingBands(),
            addIndexes(),
            addSnow(),
            addHazeScore(reflectance),
            maskClouds(),
            toInt16()
        )(image)
}

const normalize = (fromBands, toBands, bandsToConvertToFloat) =>
    image => image
        .select(fromBands, toBands)
        .updateBands(bandsToConvertToFloat, image => image.divide(10000))


const maskClouds = () =>
    image => image.updateMask(
        image.select('cloud').not()
    )

const toInt16 = () =>
    image => image
        .multiply(10000)
        .int16()

const compose = (...operations) =>
    image => operations.reduce(
        (image, operation) => operation(image),
        image
    )

module.exports = imageProcess
