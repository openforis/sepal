const {bitwiseExtract} = require('#sepal/ee/bitwiseExtract')

const addSnow = landsat =>
    image => image.addBands(
        landsat
            ? cfmaskSnow(image).or(snow(image))
            : snow(image)
        
    )

const cfmaskSnow = image =>
    bitwiseExtract(image.select('qa'), 5).rename('snow')

const snow = image =>
    snowProbability(image).gt(0.12).rename('snow')

// Based on https://earth.esa.int/c/document_library/get_file?folderId=349490&name=DLFE-4518.pdf
const snowProbability = image =>
    combine(
        image.select('ndsi').unitScaleClamp(0.2, 0.42),
        image.select('nir').unitScaleClamp(0.15, 0.35),
        image.selfExpression('i.blue/i.red').unitScaleClamp(0.18, 0.22),
        image.select('ndsi').unitScaleClamp(0.85, 0.95),
    ).rename('snowProbability')

const combine = (...probabilities) =>
    probabilities.reduce(
        (acc, prob) => prob.multiply(acc),
        1
    )

module.exports = addSnow
