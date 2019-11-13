const ee = require('@google/earthengine')

// Based on https://earth.esa.int/c/document_library/get_file?folderId=349490&name=DLFE-4518.pdf
const addSnow = () =>
    image => image.addBands(snow(image))

const snow = image =>
    image
        .expression('i.snow or snowProbability > 0.12', {
            i: image,
            snowProbability: snowProbability(image)
        })
        .rename('snow')

const snowProbability = image =>
    combine(
        image.select('ndsi').unitScaleClamp(0.2, 0.42),
        image.select('nir').unitScaleClamp(0.15, 0.35),
        image.expression('i.blue/i.red', {i: image}).unitScaleClamp(0.18, 0.22),
        image.select('ndsi').unitScaleClamp(0.85, 0.95),
    ).rename('snowProbability')

const combine = (...probabilities) =>
    probabilities.reduce(
        (acc, prob) => prob.multiply(acc),
        1
    )

module.exports = addSnow
