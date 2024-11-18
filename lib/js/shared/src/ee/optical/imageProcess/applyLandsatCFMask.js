const ee = require('#sepal/ee')
const {bitwiseExtract} = require('#sepal/ee/bitwiseExtract')

const applyLandsatCFMask = (image, {landsatCFMaskCloudMasking, landsatCFMaskCloudShadowMasking, landsatCFMaskCirrusMasking, landsatCFMaskDilatedCloud}) => {
    const qa = image.select('qa')
    const fill = bitwiseExtract(qa, 0)
    const dilatedCloud = bitwiseExtract(qa, 1)
    const cloudConfidence = bitwiseExtract(qa, 8, 9)
    const cloudShadowConfidence = bitwiseExtract(qa, 10, 11)
    const cirrusConfidence = bitwiseExtract(qa, 14, 15)

    const cloudFromConfidence = (confidence, level) =>
        level === 'MODERATE'
            ? confidence.eq(3)
            : level === 'AGGRESSIVE'
                ? confidence.gte(2)
                : null

    return ee
        .Image([
            fill,
            landsatCFMaskDilatedCloud === 'REMOVE' ? dilatedCloud : null,
            cloudFromConfidence(cloudConfidence, landsatCFMaskCloudMasking),
            cloudFromConfidence(cloudShadowConfidence, landsatCFMaskCloudShadowMasking),
            cloudFromConfidence(cirrusConfidence, landsatCFMaskCirrusMasking),
            ee.Image(0)
        ].filter(cloud => cloud))
        .reduce(ee.Reducer.max())
        .rename('cloud')
}

module.exports = applyLandsatCFMask
