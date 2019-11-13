const addShadowScore = () =>
    image => image.addBandsReplace(shadowScore(image))

const shadowScore = image =>
    image
        .expression('sqrt((pow(i.green, 2) + pow(i.red, 2) + pow(i.nir, 2)) / 3)', {i: image})
        .rename('shadowScore')

module.exports = addShadowScore
