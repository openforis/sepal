const {bitwiseExtract} = require('#sepal/ee/bitwiseExtract')

const addWater = landsat =>
    image => image.addBands(
        landsat
            ? cfmaskWater(image).or(water(image))
            : water(image)
        
    )

const cfmaskWater = image =>
    bitwiseExtract(image.select('qa'), 7).rename('water')

const water = image =>
    image
        .selfExpression('!i.snow and (i.blue/i.swir1 > 4.0 or i.ndwi > 0.15)')
        .rename('water')

module.exports = addWater
