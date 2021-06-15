const ee = require('ee')

const PIXEL_QA_ATTRIBUTES = {water: 4, shadow: 8, snow: 16, cloud: 32}
const BQA_ATTRIBUTES = {badPixels: 15, cloud: 16, shadow: 256, snow: 1024, cirrus: 4096}

const applyQA = (cloudDetection, cloudMasking) =>
    image => {
        const qaBand = ee.Dictionary(
            ee.Dictionary(
                ee.Dictionary(
                    image.get('dataSetSpec')
                ).get('bands')
            ).get('qa')
        ).getString('name')
        const withBands = ee.Image(ee.Algorithms.If(
            qaBand.match('pixel_qa').length(),
            pixelQA(image, cloudDetection),
            ee.Algorithms.If(
                qaBand.match('BQA').length(),
                BQA(image, cloudDetection),
                QA60(image, cloudDetection, cloudMasking)
            )
        ))
        return withBands
            .updateMask(withBands.select('toMask').not())
            .removeBands('toMask')
    }

const pixelQA = (image, cloudDetection) => {
    const hasAttribute = hasAttributes(image.select('qa'), PIXEL_QA_ATTRIBUTES)
    return image
        .addBandsReplace(hasAttribute('shadow').rename('toMask'))
        .addBandsReplace(
            cloudDetection.includes('QA')
                ? hasAttribute('cloud').rename('cloud')
                : ee.Image(0).rename('cloud')
        )
        .addBandsReplace(hasAttribute('snow').rename('snow'))
}

const BQA = (image, cloudDetection) => {
    const hasAttribute = hasAttributes(image.select('qa'), BQA_ATTRIBUTES)

    return image
        .addBandsReplace(hasAttribute('badPixels', 'shadow').rename('toMask'))
        .addBandsReplace(
            cloudDetection.includes('QA')
                ? hasAttribute('cloud', 'cirrus').rename('cloud')
                : ee.Image(0).rename('cloud')
        )
        .addBandsReplace(hasAttribute('snow').rename('snow'))
}

const QA60 = (image, cloudDetection, cloudMasking) =>
    image
        .addBandsReplace(ee.Image(0).rename('toMask'))
        .addBandsReplace(
            cloudDetection.includes('QA')
                ? ee.Image(image.get('cloudProbability'))
                    .gt(cloudMasking === 'AGGRESSIVE' ? 30 : 65)
                    .rename('cloud')
                : ee.Image(0).rename('cloud')
        )
        .addBandsReplace(ee.Image(0).rename('snow'))

const hasAttributes = (image, attributeByValue) =>
    (...attributes) =>
        attributes.reduce(
            (acc, attribute) => acc.or(image.select(0).bitwiseAnd(attributeByValue[attribute]).neq(0)),
            ee.Image(0)
        )

module.exports = applyQA
