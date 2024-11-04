const ee = require('#sepal/ee')
const {bitwiseExtract} = require('#sepal/ee/bitwiseExtract')

const applyQA = (cloudDetection, cloudMasking, dataSetSpec) =>
    image => {
        const qaBandName = dataSetSpec.bands.qa.name
        const algorithms = {
            QA_PIXEL: () => QA_PIXEL(image, cloudDetection),
            QA60: () => QA60(image, cloudDetection, cloudMasking),
        }
        const withBands = ee.Image(algorithms[qaBandName]())
        return withBands
            .updateMask(withBands.select('toMask').not())
            .removeBands('toMask')
    }

const QA_PIXEL = (image, cloudDetection) => {
    const qa = image.select('qa')
    const cloudShadow = bitwiseExtract(qa, 4)
    const snow = bitwiseExtract(qa, 5).rename('snow')
    const cloud = bitwiseExtract(qa, 6).not().rename('cloud')
    const water = bitwiseExtract(qa, 7).rename('water')
    return image
        .addBandsReplace(cloudShadow.rename('toMask'))
        .addBandsReplace(
            cloudDetection.includes('QA')
                ? cloud
                : ee.Image(0).rename('cloud')
        )
        .addBandsReplace(snow)
        .addBandsReplace(water)
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
        .addBandsReplace(ee.Image(0).rename('water'))

const hasAttributes = (image, attributeByValue) =>
    (...attributes) =>
        attributes.reduce(
            (acc, attribute) => acc.or(image.select(0).bitwiseAnd(attributeByValue[attribute]).neq(0)),
            ee.Image(0)
        )

module.exports = applyQA
