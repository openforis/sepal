const addShadowScore = () =>
    image => image.addBandsReplace(shadowScore(image))

const shadowScore = image =>
    image
        .selfExpression('sqrt((pow(i.green, 2) + pow(i.red, 2) + pow(i.nir, 2)) / 3)')
        .rename('shadowScore')

module.exports = addShadowScore
