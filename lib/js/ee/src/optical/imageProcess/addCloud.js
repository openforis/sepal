import ee from '#sepal/ee/ee'

import applyLandsatCFMask from './applyLandsatCFMask.js'
import applyPino26 from './applyPino26.js'
import applySentinel2CloudProbability from './applySentinel2CloudProbability.js'
import applySentinel2CloudScorePlus from './applySentinel2CloudScorePlus.js'
import applySepalCloudScore from './applySepalCloudScore.js'

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

export default addCloud
