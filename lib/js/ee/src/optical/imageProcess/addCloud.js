const ee = require('#sepal/ee/ee')
const applyLandsatCFMask = require('./applyLandsatCFMask')
const applyPino26 = require('./applyPino26')
const applySentinel2CloudProbability = require('./applySentinel2CloudProbability')
const applySentinel2CloudScorePlus = require('./applySentinel2CloudScorePlus')
const applySepalCloudScore = require('./applySepalCloudScore')

const addCloud = ({
    sentinel2,
    includedCloudMasking,
    sentinel2CloudProbabilityMaxCloudProbability,
    sentinel2CloudScorePlusBand,
    sentinel2CloudScorePlusMaxCloudProbability,
    landsatCFMaskCloudMasking,
    landsatCFMaskCloudShadowMasking,
    landsatCFMaskCirrusMasking,
    landsatCFMaskDilatedCloud,
    sepalCloudScoreMaxCloudProbability,
}) =>
    image => {
        const toCloud = algorithm => {
            if (sentinel2 && algorithm === 'sentinel2CloudProbability') {
                return applySentinel2CloudProbability(image,
                    {sentinel2CloudProbabilityMaxCloudProbability}
                )
            } else if (sentinel2 && algorithm === 'sentinel2CloudScorePlus') {
                return applySentinel2CloudScorePlus(image,
                    {sentinel2CloudScorePlusBand, sentinel2CloudScorePlusMaxCloudProbability}
                )
            } else if (!sentinel2 && algorithm === 'landsatCFMask') {
                return applyLandsatCFMask(image,
                    {landsatCFMaskCloudMasking, landsatCFMaskCloudShadowMasking, landsatCFMaskCirrusMasking, landsatCFMaskDilatedCloud}
                )
            } else if (algorithm === 'sepalCloudScore') {
                return applySepalCloudScore(image,
                    {sepalCloudScoreMaxCloudProbability}
                )
            } else if (sentinel2 && algorithm === 'pino26') {
                return applyPino26(image)
            } else {
                return ee.Image(0)
            }
        }

        const cloud = includedCloudMasking && includedCloudMasking.length
            ? ee.Image(
                includedCloudMasking.map(toCloud)
            ).reduce(ee.Reducer.max()).rename('cloud')
            : ee.Image(0).rename('cloud')

        return image.addBands(cloud)
    }

module.exports = addCloud
