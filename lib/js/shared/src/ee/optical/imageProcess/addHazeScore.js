const ee = require('#sepal/ee')

const addHazeScore = reflectance =>
    image => image.addBandsReplace(
        reflectance === 'TOA'
            ? hazeScore(image)
            : ee.Image(1).rename('hazeScore')
    )

const hazeScore = image => {
    const variabilityProb = variabilityProbability(image)
    return image
        .expression('max(1 - (hazeProb + variabilityProb + cirrusCloudProb + aerosolProb) / 10, 0)', {
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
        .selfExpression('min(50 * max(i.blue - 0.5 * i.red - 0.06, 0), 1)')
        .rename('hazeProbability')

const aerosolProbability = image =>
    image
        .selfExpression('max(100 * pow(i.aerosol - 0.15, 2), 0)')
        .rename('aerosolProbability')

const cirrusCloudProbability = image =>
    image
        .selfExpression('i.cirrus / 0.04')
        .rename('cirrusCloudProbability')

const meanVis = image =>
    image
        .selfExpression('(i.blue + i.green + i.red) / 3')
        .rename('meanVis')

const whiteness = image =>
    image
        .selfExpression('(abs(i.blue - meanVis) + abs(i.green - meanVis) + abs(i.red - meanVis)) / meanVis', {
            meanVis: meanVis(image)
        })
        .rename('whiteness')

const variabilityProbability = image =>
    image
        .selfExpression('min(1 - max(max(abs(i.ndvi), abs(i.ndsi)), whiteness), 0.1)', {
            whiteness: whiteness(image)
        })
        .rename('variabilityProbability')
        
module.exports = addHazeScore
