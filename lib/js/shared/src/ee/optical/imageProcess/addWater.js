const addWater = () =>
    image => image.addBandsReplace(water(image))

const water = image =>
    image
        .selfExpression('!i.snow and (i.blue/i.swir1 > 4.0 or i.ndwi > 0.15)')
        .rename('water')

module.exports = addWater
