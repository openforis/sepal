const ee = require('@google/earthengine')

const PIXEL_QA_ATTRIBUTES = {water: 4, shadow: 8, snow: 16, cloud: 32}
const BQA_ATTRIBUTES = {badPixels: 15, cloud: 16, shadow: 256, snow: 1024, cirrus: 4096}

const applyQA = (bands, qaBand) =>
    image => {
        const withBands = qaBand === 'pixel_qa'
            ? pixelQA(image)
            : qaBand === 'BQA'
                ? BQA(image)
                : QA60(image)
        return withBands
            .updateMask(withBands.select('toMask').not())
            .removeBands('toMask')
    }

const pixelQA = image => {
    const hasAttribute = hasAttributes(image.select('qa'), PIXEL_QA_ATTRIBUTES)
    return image
        .addBandsReplace(hasAttribute('shadow').rename('toMask'))
        .addBandsReplace(hasAttribute('cloud').rename('cloud'))
        .addBandsReplace(hasAttribute('snow').rename('snow'))
}

const BQA = image => {
    const hasAttribute = hasAttributes(image.select('qa'), BQA_ATTRIBUTES)
    return image
        .addBandsReplace(hasAttribute('badPixels', 'shadow').rename('toMask'))
        .addBandsReplace(hasAttribute('cloud', 'cirrus').rename('cloud'))
        .addBandsReplace(hasAttribute('snow').rename('snow'))
}

const QA60 = image =>
    image
        .addBandsReplace(ee.Image(0).rename('toMask'))
        .addBandsReplace(image.select('qa').not().not().rename('cloud'))
        .addBandsReplace(ee.Image(0).rename('snow'))


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
