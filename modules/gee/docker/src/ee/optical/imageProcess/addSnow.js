// Based on https://earth.esa.int/c/document_library/get_file?folderId=349490&name=DLFE-4518.pdf
const addSnow = () =>
    image => image.addBandsReplace(snow(image))

const snow = image =>
    image
        .selfExpression('i.snow or snowProbability > 0.12', {
            snowProbability: snowProbability(image)
        })
        .rename('snow')

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
