const ee = require('@google/earthengine')
const _ = require('lodash')

const imageProcessor = ({spec}) => {
    const bands = spec.bands
    const fromBands = Object.values(bands).map(band => band.name)
    const toBands = Object.keys(bands)
    const bandsToConvertToFloat = _.chain(bands)
        .pickBy(({scaled}) => scaled)
        .keys()
        .value()

    return image =>
        compose(
            normalize(fromBands, toBands, bandsToConvertToFloat),
            applyQABands(toBands),
            maskClouds(),
            toInt16()
        )(image)
}

const normalize = (fromBands, toBands, bandsToConvertToFloat) =>
    image => image
        .select(fromBands, toBands)
        .updateBands(bandsToConvertToFloat, image => image.divide(10000))

const applyQABands = bands =>
    image => bands.includes('pixel_qa')
        ? pixelQA(image)
        : bands.includes('BQA')
            ? BQA(image)
            : noQA(image)

const pixelQA = image => {
    const attributes = getAttributes(
        image.select('pixel_qa'),
        {'badPixels': 15, 'cloud': 16, 'shadow': 256, 'snow': 1024, 'cirrus': 4096}
    )
    return image
        .addBands(attributes.includes('shadow').rename('toMask'))
        .addBands(attributes.includes('cloud').rename('cloud'))
        .addBands(attributes.includes('snow').rename('snow'))
    // .removeBands('pixel_qa')
}

const BQA = image => {
    const attributes = getAttributes(
        image.select('BQA'),
        {'badPixels': 15, 'cloud': 16, 'shadow': 256, 'snow': 1024, 'cirrus': 4096}
    )
    return image
        .addBands(attributes.includes('badPixels', 'shadow').rename('toMask'))
        .addBands(attributes.includes('cloud', 'cirrus').rename('cloud'))
        .addBands(attributes.includes('snow').rename('snow'))
    // .removeBands('BQA')
}

const noQA = image =>
    image
        .addBands(ee.Image(0).rename('toMask'))
        .addBands(ee.Image(0).rename('cloud'))
        .addBands(ee.Image(0).rename('snow'))

const getAttributes = (image, attributeByValue) => ({
    includes: (...attributes) =>
        attributes.reduce(
            (acc, attribute) => acc.or(image.select(0).bitwiseAnd(attributeByValue[attribute]).neq(0)),
            ee.Image(0)
        )
})

const maskClouds = () =>
    image => image.updateMask(image.select('cloud').not())

const toInt16 = () =>
    image => image
        .multiply(10000)
        .int16()

const compose = (...operations) =>
    image => operations.reduce(
        (image, operation) => operation(image),
        image
    )

module.exports = imageProcessor
