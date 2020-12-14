const addIndexes = () =>
    image => image
        .addBandsReplace(ndsi(image))
        .addBandsReplace(ndvi(image))
        .addBandsReplace(ndwi(image))

const ndsi = image =>
    image
        .selfExpression('(i.green - i.swir1) / (i.green + i.swir1)')
        .rename('ndsi')

const ndvi = image =>
    image
        .selfExpression('(i.nir - i.red) / (i.nir + i.red)')
        .rename('ndvi')

const ndwi = image =>
    image
        .selfExpression('(i.green - i.nir) / (i.green + i.nir)')
        .rename('ndwi')

module.exports = addIndexes
