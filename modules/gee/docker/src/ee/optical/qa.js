const ee = require('@google/earthengine')

const PIXEL_QA_ATTRIBUTES = {water: 4, shadow: 8, snow: 16, cloud: 32}
const BQA_ATTRIBUTES = {badPixels: 15, cloud: 16, shadow: 256, snow: 1024, cirrus: 4096}

const applyQA = bands =>
    image => bands.includes('pixel_qa')
        ? pixelQA(image)
        : bands.includes('BQA')
            ? BQA(image)
            : noQA(image)

const pixelQA = image => {
    const hasAttribute = hasAttributes(image.select('pixel_qa'), PIXEL_QA_ATTRIBUTES)
    return image
        .addBands(hasAttribute('shadow').rename('toMask'))
        .addBands(hasAttribute('cloud').rename('cloud'))
        .addBands(hasAttribute('snow').rename('snow'))
    // .removeBands('pixel_qa')
}

const BQA = image => {
    const hasAttribute = hasAttributes(image.select('BQA'), BQA_ATTRIBUTES)
    return image
        .addBands(hasAttribute('badPixels', 'shadow').rename('toMask'))
        .addBands(hasAttribute('cloud', 'cirrus').rename('cloud'))
        .addBands(hasAttribute('snow').rename('snow'))
    // .removeBands('BQA')
}

const noQA = image =>
    image
        .addBands(ee.Image(0).rename('toMask'))
        .addBands(ee.Image(0).rename('cloud'))
        .addBands(ee.Image(0).rename('snow'))

const hasAttributes = (image, attributeByValue) =>
    (...attributes) =>
        attributes.reduce(
            (acc, attribute) => acc.or(image.select(0).bitwiseAnd(attributeByValue[attribute]).neq(0)),
            ee.Image(0)
        )

module.exports = applyQA
