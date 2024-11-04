const ee = require('#sepal/ee')
const {bitwiseExtract} = require('#sepal/ee/bitwiseExtract')

const applyQA = (cloudDetection, cloudMasking, dataSetSpec) =>
    image => {
        const algorithms = {
            QA_PIXEL: () => QA_PIXEL(image, cloudDetection),
            QA60: () => QA60(image, cloudDetection, cloudMasking),
        }

        const qaBandName = dataSetSpec.bands.qa.name
        const withBands = algorithms[qaBandName]()

        return withBands
            .updateMask(withBands.select('toMask').not())
            .removeBands('toMask')
    }

const QA60 = (image, cloudDetection, cloudMasking) =>
    ee.Image(image
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
    )

const QA_PIXEL = (image, cloudDetection) => {
    const qa = image.select('qa')
    const cloudShadow = bitwiseExtract(qa, 4)
    const snow = bitwiseExtract(qa, 5).rename('snow')
    const cloud = bitwiseExtract(qa, 6).not().rename('cloud')
    const water = bitwiseExtract(qa, 7).rename('water')
    return ee.Image(image
        .addBandsReplace(cloudShadow.rename('toMask'))
        .addBandsReplace(
            cloudDetection.includes('QA')
                ? cloud
                : ee.Image(0).rename('cloud')
        )
        .addBandsReplace(snow)
        .addBandsReplace(water)
    )
}

module.exports = applyQA
