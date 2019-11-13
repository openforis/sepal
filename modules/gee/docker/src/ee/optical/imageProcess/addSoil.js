const addSoil = () =>
    image => image.addBandsReplace(soil(image))

const soil = image =>
    image
        .expression('i.blue/i.swir1 < 0.55 or i.nir/i.swir1 < 0.90', {i: image})
        .rename('soil')

module.exports = addSoil
