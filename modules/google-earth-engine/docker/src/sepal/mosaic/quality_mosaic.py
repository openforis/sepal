import ee


def create(collection):
    target = collection.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2']).median()

    def add_quality(image):
        i = image.select(target.bandNames())
        closenessByBand = i.select(target.bandNames()).expression(
            '1 - abs((i - t) / (i + t))', {'i': i, 't': target})
        quality = closenessByBand.reduce(ee.Reducer.sum()).rename(['quality'])
        return image.addBands(quality)

    collection = collection.map(add_quality)
    return collection.qualityMosaic('quality')
