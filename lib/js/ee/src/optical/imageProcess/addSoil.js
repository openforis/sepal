const addSoil = () =>
    image => image.addBandsReplace(soil(image))

const soil = image =>
    image
        .selfExpression('i.blue/i.swir1 < 0.55 or i.nir/i.swir1 < 0.90')
        .rename('soil')

module.exports = addSoil
