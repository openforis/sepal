const addHazeScore = () =>
    image => image.addBands(hazeScore(image))

const hazeScore = image =>
    image
        .expression(`max(1 - (hazeProb + variabilityProb + cirrusCloudProb + aerosolProb) / 10, 0)`, {
            hazeProb: hazeProbability(image),
            variabilityProb: variabilityProbability(image),
            cirrusCloudProb: cirrusCloudProbability(image),
            aerosolProb: aerosolProbability(image)
        })
        .rename('hazeScore')

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
        .expression('1 - max(max(abs(i.ndvi), abs(i.ndsi)), whiteness)', {
                i: image,
                whiteness: whiteness(image)
            }
        )
        .rename('variabilityProbability')

/*
TODO: This doesn't make sense - min value will be 0.1, so never any need for masking

        self.set('variabilityProbability',
            'max(i.variabilityProbability, 0.1)')
        self.setIf('toMask', '!i.toMask', 'i.variabilityProbability < -0.5')  # Remove bad pixels
*/

module.exports = addHazeScore
