const addIndexes = () =>
    image => image
        .addBands(ndsi(image))
        .addBands(ndvi(image))
        .addBands(ndwi(image))

const ndsi = image =>
    image
        .expression('(i.green - i.swir1) / (i.green + i.swir1)', {i: image})
        .rename('ndsi')

const ndvi = image =>
    image
        .expression('(i.nir - i.red) / (i.nir + i.red)', {i: image})
        .rename('ndvi')

const ndwi = image =>
    image
        .expression('(i.green - i.nir) / (i.green + i.nir)', {i: image})
        .rename('ndwi')

module.exports = addIndexes
