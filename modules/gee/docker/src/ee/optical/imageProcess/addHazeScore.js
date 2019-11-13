const ee = require('@google/earthengine')

const addHazeScore = reflectance =>
    image => image.addBandsReplace(
        reflectance === 'TOA'
            ? hazeScore(image)
            : ee.Image(1).rename('hazeScore')
    )

const hazeScore = image => {
    const variabilityProb = variabilityProbability(image)
    return image
        .expression(`max(1 - (hazeProb + variabilityProb + cirrusCloudProb + aerosolProb) / 10, 0)`, {
            variabilityProb,
            hazeProb: hazeProbability(image),
            cirrusCloudProb: cirrusCloudProbability(image),
            aerosolProb: aerosolProbability(image)
        })
        .updateMask(variabilityProb.gt(-0.5))
        .rename('hazeScore')
}

const hazeProbability = image =>
    image
        .expression('min(50 * max(i.blue - 0.5 * i.red - 0.06, 0), 1)', {i: image})
        .rename('hazeProbability')

const aerosolProbability = image =>
    image
        .expression('max(100 * pow(i.aerosol - 0.15, 2), 0)', {i: image})
        .rename('aerosolProbability')

const cirrusCloudProbability = image =>
    image
        .expression('i.cirrus / 0.04', {i: image})
        .rename('cirrusCloudProbability')

const meanVis = image =>
    image
        .expression('(i.blue + i.green + i.red) / 3', {i: image})
        .rename('meanVis')

const whiteness = image =>
    image
        .expression('(abs(i.blue - meanVis) + abs(i.green - meanVis) + abs(i.red - meanVis)) / meanVis', {
                i: image,
                meanVis: meanVis(image)
            }
        )
        .rename('whiteness')

const variabilityProbability = image =>
    image
        .expression('min(1 - max(max(abs(i.ndvi), abs(i.ndsi)), whiteness), 0.1)', {
                i: image,
                whiteness: whiteness(image)
            }
        )
        .rename('variabilityProbability')
module.exports = addHazeScore
