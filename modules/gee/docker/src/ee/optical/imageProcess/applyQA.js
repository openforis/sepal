const ee = require('@google/earthengine')

const PIXEL_QA_ATTRIBUTES = {water: 4, shadow: 8, snow: 16, cloud: 32}
const BQA_ATTRIBUTES = {badPixels: 15, cloud: 16, shadow: 256, snow: 1024, cirrus: 4096}

const applyQA = bands =>
    image => {
        const withBands = bands.includes('pixel_qa')
            ? pixelQA(image)
            : bands.includes('BQA')
                ? BQA(image)
                : QA60(image)
        return withBands
            .updateMask(withBands.select('toMask').not())
            .removeBands('toMask')
    }

const pixelQA = image => {
    const hasAttribute = hasAttributes(image.select('pixel_qa'), PIXEL_QA_ATTRIBUTES)
    return image
        .addBandsReplace(hasAttribute('shadow').rename('toMask'))
        .addBandsReplace(hasAttribute('cloud').rename('cloud'))
        .addBandsReplace(hasAttribute('snow').rename('snow'))
        .removeBands('pixel_qa')
}

const BQA = image => {
    const hasAttribute = hasAttributes(image.select('BQA'), BQA_ATTRIBUTES)
    return image
        .addBandsReplace(hasAttribute('badPixels', 'shadow').rename('toMask'))
        .addBandsReplace(hasAttribute('cloud', 'cirrus').rename('cloud'))
        .addBandsReplace(hasAttribute('snow').rename('snow'))
        .removeBands('BQA')
}

const QA60 = image =>
    image
        .addBandsReplace(ee.Image(0).rename('toMask'))
        .addBandsReplace(image.select('QA60').not().not().rename('cloud'))
        .addBandsReplace(ee.Image(0).rename('snow'))
        .removeBands('QA60')


// const noQA = image =>
//     image
//         .addBandsReplace(ee.Image(0).rename('toMask'))
//         .addBandsReplace(ee.Image(0).rename('cloud'))
//         .addBandsReplace(ee.Image(0).rename('snow'))

const hasAttributes = (image, attributeByValue) =>
    (...attributes) =>
        attributes.reduce(
            (acc, attribute) => acc.or(image.select(0).bitwiseAnd(attributeByValue[attribute]).neq(0)),
            ee.Image(0)
        )

module.exports = applyQA
