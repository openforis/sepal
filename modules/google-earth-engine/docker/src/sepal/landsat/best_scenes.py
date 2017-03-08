import ee


def find(aoi, from_date, to_date, target_day_of_year, target_day_of_year_weight):
    collection = ee.ImageCollection('LANDSAT/LC8_L1T_TOA_FMASK') \
        .filterBounds(aoi.geometry()) \
        .filter(ee.Filter.date(from_date, to_date))

    ids = ee.List(collection.sort('system:time_start').aggregate_array('system:index'))
    mosaic = create_mosaic(collection, ids, target_day_of_year, target_day_of_year_weight)
    used_ids = used_ids_reduceRegion(mosaic, aoi, ids)
    return used_ids.getInfo()


def used_ids_reduceToVectors(image, aoi, ids):
    segments = image.select('index').uint16().reduceToVectors(
        scale=300,
        bestEffort=True,
        maxPixels=1e5,
        tileScale=16,
        geometry=aoi.geometry(),
        geometryType='centroid',
        labelProperty='index'
    )
    usedIndexes = ee.List(segments.distinct('index').aggregate_array('index'))
    return usedIndexes.map(lambda index: ids.get(index))


def used_ids_reduceRegion(image, aoi, ids):
    histogram = ee.Array(image.select('index').uint16().reduceRegion(
        reducer=(ee.Reducer.fixedHistogram(0, ids.length(), ids.length())),
        geometry=aoi.geometry(),
        scale=300,
        bestEffort=True,
        maxPixels=1e5,
        tileScale=16
    ).get('index'))
    indexList = ee.List.sequence(0, ids.length().subtract(1))
    return indexList.map(lambda index: ee.Algorithms.If(
        histogram.get([index, 1]).gt(0),
        ids.get(index),
        None
    )).removeAll([None])


def used_ids_sample(image, aoi, ids):
    samples = image.select('index').uint16().sample(
        region=aoi.geometry(),
        scale=300,
        factor=0.01
    )
    usedIndexes = ee.List(samples.distinct('index').aggregate_array('index'))
    return usedIndexes.map(lambda index: ids.get(index))


def index_band(image, ids):
    id = image.get('system:index')
    image_index = ids.indexOf(id)
    return ee.Image(image_index).uint8().rename(['index'])


def create_mosaic(collection, ids, target_day_of_year, target_day_of_year_weight):
    return collection \
        .map(lambda image: add_bands(image, ids, target_day_of_year, target_day_of_year_weight)) \
        .qualityMosaic('quality')


def add_bands(image, ids, target_day_of_year, target_day_of_year_weight):
    image = image \
        .addBands([index_band(image, ids)]) \
        .addBands([quality_band(image, target_day_of_year, target_day_of_year_weight)])
    return image.updateMask(image.select('fmask').lt(2))


def quality_band(image, targetDay, target_day_of_year_weight):
    acquisition = ee.Number(image.get('system:time_start'))
    day = ee.Date(acquisition).getRelative('day', 'year')
    daysFromTargetDay = day.subtract(targetDay).abs()
    daysFromTargetDay = daysFromTargetDay.min(
        ee.Number(365).subtract(daysFromTargetDay)  # Closer over year boundary?
    )
    dayDistance = daysFromTargetDay.divide(183)
    dayDistanceQuality = ee.Image(ee.Number(1).subtract(dayDistance))

    cloudQuality = image.metadata('CLOUD_COVER').divide(100).subtract(1).abs()
    quality = dayDistanceQuality.multiply(target_day_of_year_weight) \
        .add(cloudQuality.multiply(1 - target_day_of_year_weight))
    return quality.multiply(10000).int().rename(['quality'])
