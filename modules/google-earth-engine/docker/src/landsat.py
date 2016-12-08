import logging

import ee
from itertools import groupby

_collection_names_by_sensor = {
    'LANDSAT_8': ['LANDSAT/LC8_L1T_TOA_FMASK'],
    'LANDSAT_ETM_SLC_OFF': ['LANDSAT/LE7_L1T_TOA_FMASK'],
    'LANDSAT_ETM': ['LANDSAT/LE7_L1T_TOA_FMASK'],
    'LANDSAT_TM': ['LANDSAT/LT4_L1T_TOA_FMASK', 'LANDSAT/LT5_L1T_TOA_FMASK'],
}
_collection_name_by_scene_id_prefix = {
    'LC8': 'LANDSAT/LC8_L1T_TOA_FMASK',
    'LE7': 'LANDSAT/LE7_L1T_TOA_FMASK',
    'LT5': 'LANDSAT/LT5_L1T_TOA_FMASK',
    'LT4': 'LANDSAT/LT4_L1T_TOA_FMASK',
}

_bands_by_collection_name = {
    'LANDSAT/LC8_L1T_TOA_FMASK': ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B10', 'fmask'],
    'LANDSAT/LE7_L1T_TOA_FMASK': ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B6_VCID_1', 'fmask'],
    'LANDSAT/LT5_L1T_TOA_FMASK': ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B6', 'fmask'],
    'LANDSAT/LT4_L1T_TOA_FMASK': ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B6', 'fmask']
}

normalized_band_names = ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B10', 'fmask']
_milis_per_day = 1000 * 60 * 60 * 24


def create_mosaic(
        aoi,
        sensors,
        target_day_of_year,
        target_day_of_year_weight,
        from_date,
        to_date,
        bands):
    """
    Creates a cloud-free mosaic, automatically selecting scenes to include based on provided parameters.

    Scenes from the specified sensors, within the area of interest, between the from and to dates will be used.
    The warmest, wettest pixels, close to the specified target day of year, from scenes with low cloud cover
    will be selected in the composite.

    :param aoi: The aoi to create the mosaic for.
    :type aoi: ee.Geometry

    :param sensors: The sensors to include imagery from.
    :type sensors: iterable

    :param target_day_of_year: Ideal day of year to use scenes from.
    :type target_day_of_year: int

    :param target_day_of_year_weight: The importance of target day of year.
        0 means no importance, 1 means very important, and 0.5 means somewhat important.
    :type target_day_of_year_weight: float

    :param from_date: The earliest date to include scenes from.
    :type from_date: datetime.date

    :param to_date: The latest date to include scenes from.
    :type to_date: datetime.date

    :param bands: The bands to include in the mosaic.
        Valid bands are B1, B2, B3, B4, B5, B7, B10, temp (temperature band), date (days since epoch),
        and days (days from target day)
    :type bands: iterable
    :return: cloud-free mosaic, clipped to the area of interest, contains the specified bands.
         """
    logging.info('Creating mosaic')
    # Filter to apply to all image collections
    filter = _create_image_filter(aoi, from_date, to_date)
    # Converts from Sepal sensor names to GEE collection names
    collection_names = _to_collection_names(sensors)
    # Creates an image collection for each GEE collection name
    image_collections = [_create_filtered_image_collection(name, filter) for name in collection_names]
    mosaic = _create_mosaic(image_collections, aoi, target_day_of_year, target_day_of_year_weight, bands)
    return mosaic


def create_mosaic_from_scene_ids(
        aoi,
        sceneIds,
        target_day_of_year,
        target_day_of_year_weight,
        bands):
    """
    Creates a cloud-free mosaic, selecting scenes based on provided ids.

    The warmest, wettest pixels, close to the specified target day of year, from scenes with low cloud cover
    will be selected in the composite.

    :param aoi: The aoi to create the mosaic for.
    :type aoi: ee.Geometry

    :param sensors: The sensors to include imagery from.
    :type sensors: iterable

    :param target_day_of_year: Ideal day of year to use scenes from.
    :type target_day_of_year: int

    :param target_day_of_year_weight: The importance of target day of year.
        0 means no importance, 1 means very important, and 0.5 means somewhat important.
    :type target_day_of_year_weight: float

    :param from_date: The earliest date to include scenes from.
    :type from_date: datetime.date

    :param to_date: The latest date to include scenes from.
    :type to_date: datetime.date

    :param bands: The bands to include in the mosaic.
        Valid bands are B1, B2, B3, B4, B5, B7, B10, temp (temperature band), date (days since epoch), 
        days (days from target day), and ndvi
    :type bands: iterable

    :return: cloud-free mosaic, clipped to the area of interest, contains the specified bands.
         """
    logging.info('Creating mosaic from ' + str(len(sceneIds)) + ' scenes')
    # Creates a dictionary with collection name as key and the scene ids as value
    scene_ids_by_collection_name = groupby(sorted(sceneIds), _collection_name)
    # Creates an image collection for each GEE collection name, with its corresponding scenes
    image_collections = [_create_image_collection(name, ids) for name, ids in scene_ids_by_collection_name]
    mosaic = _create_mosaic(image_collections, aoi, target_day_of_year, target_day_of_year_weight, bands)
    return mosaic


def cluster(mosaic):
    # TODO: Do the classification
    # Expects an image with a band called 'cluster' to be returned
    # For now, returns some other band renamed to 'cluster'
    return mosaic.select(['B1'], ['cluster'])


def _create_image_filter(aoi, from_date, to_date):
    """Creates a filter, removing all scenes outside of area of interest and outside of date range.

    :param aoi: The area to include scenes from
    :type sensors: ee.Geometry

    :param from_date: The earliest date to include scenes from
    :type from_date: datetime.date

    :param to_date: The latest date to include scenes from
    :type from_date: datetime.date

    :return: An ee.Filter.
    """
    bounds_filter = ee.Filter.geometry(aoi)
    # noinspection PyCallByClass,PyTypeChecker
    date_filter = ee.Filter.date(from_date, to_date)
    no_LO8_filter = ee.Filter.stringStartsWith('LO8').Not()
    filter = ee.Filter.And(
        bounds_filter,
        date_filter,
        no_LO8_filter
    )
    return filter


def _to_collection_names(sensors):
    """Converts a list of Sepal sensor names to Google Earth Engine collection names.

    :param sensors: A list of the Sepal sensor names.
    :type sensors: iterable

    :return: A set of collection names.
    """
    return set(
        _flatten(
            map(lambda sensor: _collection_names_by_sensor[sensor], sensors)
        )
    )


def _create_filtered_image_collection(collection_name, filter):
    """Creates an image collection, with the provided filter applied, with normalized band names.

    The band names will be normalized to B1, B2, B3, B4, B5, B7, B10.

    :param collection_name: A Google Earth Engine collection name.
    :type collection_name: str

    :param filter: They filter to apply.
    :type target_day_of_year: ee.Filter

    :return: An ee.ImageCollection().
    """
    filtered_collection = ee.ImageCollection(collection_name).filter(filter)
    normalized_collection = filtered_collection.map(
        lambda image: _normalize_band_names(image, collection_name)
    )
    return normalized_collection


def _create_image_collection(name, image_ids):
    """Creates an image collection containing images with the specified ids.

    The band names will be normalized to B1, B2, B3, B4, B5, B7, B10.

    :param collection_name: A Google Earth Engine collection name.
    :type collection_name: str

    :param image_ids: They ids of the images to include in the collection.
    :type image_ids: iterable

    :return: An ee.ImageCollection().
    """
    image_list = ee.List(list(image_ids))
    images = image_list \
        .map(_to_image) \
        .removeAll([None])
    collection = ee.ImageCollection(images)
    normalized_collection = collection.map(
        lambda image: _normalize_band_names(image, name)
    )
    return normalized_collection


def _create_mosaic(image_collections, aoi, target_day_of_year, target_day_of_year_weight, bands):
    """Creates a mosaic, clipped to the area of interest, containing the specified bands.

    :param image_collection: The image collections to create a mosaic for.
        All collections must have normalized band names.
    :type image_collection: iterable

    :param aoi: The area to clip the mosaic to.
    :type aoi: ee.Geometry

    :param target_day_of_year: Ideal day of year to use scenes from.
    :type target_day_of_year: int

    :param target_day_of_year: The bands to include in the mosaic.
    :type target_day_of_year: iterable

    :param target_day_of_year_weight: The importance of target day of year.
        0 means no importance, 1 means very important, and 0.5 means somewhat important.
    :type target_day_of_year_weight: float

    :return: An ee.Image.
    """
    # Merges the image collections into a single collection
    image_collection = reduce(_merge_image_collections, image_collections)
    # Adjust the images - add additional bands, apply TOA correction
    image_collection_qa = image_collection.map(
        lambda image: _adjust_image(image, target_day_of_year, target_day_of_year_weight, bands)
        # lambda image: _addqa(image, target_day_of_year, bands)
    )
    # Create a 'best pixel' composite using the warmest, wettest pixel closest to specified target date
    mosaic = image_collection_qa.qualityMosaic('cweight')
    # Clip the water bodies according to GFC Water Mask
    return mosaic \
        .clip(aoi) \
        .select(bands) \
        .int16()


def _adjust_image(image, target_day_of_year, target_day_of_year_weight, bands):
    """Applies TOA correction to the image and adds a number of bands.

        * cweight - weight based on temperature, wetness, days from target day of year, and cloud cover 
        * date - days since epoch
        * days - days from target day of year
        * temp - temperature

    :param image: The image to adjust.
        All collections must have normalized band names.
    :type image: ee.Image

    :param target_day_of_year: Ideal day of year to use scenes from.
    :type target_day_of_year: int

    :param target_day_of_year_weight: The importance of target day of year.
        0 means no importance, 1 means very important, and 0.5 means somewhat important.
    :type target_day_of_year_weight: float

    :param bands: The bands to include in the mosaic.
        Valid bands are B1, B2, B3, B4, B5, B7, B10, temp (temperature band), date (days since epoch), 
        days (days from target day), and ndvi
    :type bands: iterable

    :return: The adjusted ee.Image.
    """
    image = _mask_clouds(image)
    image_day_of_year = _day_of_year(image)
    days_from_target_day = _days_between(image_day_of_year, target_day_of_year)

    # Bands to add
    ndvi_band = _ndvi_band(image)
    temp_band = _temp_band(image)
    date_band = _date_band(image)
    days_band = _days_band(days_from_target_day, image)

    # Normalized values to use in weight band
    ndvi_normalized = _normalized_ndvi(ndvi_band)
    temp_normalized = _normalized_temp(temp_band)
    cloud_cover_normalized = _normalized_cloud_cover(image)
    days_from_target_day_normalized = _normalized_days_from_target_day(days_from_target_day)

    # Create weight band
    weight_band = ndvi_normalized.multiply(6) \
        .add(temp_normalized.multiply(0)) \
        .add(cloud_cover_normalized.multiply(3)) \
        .add(days_from_target_day_normalized.multiply(target_day_of_year_weight * 2)) \
        .rename(['cweight'])

    # Apply TOA correction
    result = _apply_toa_correction(image, image_day_of_year, bands)
    return result \
        .addBands(ndvi_band) \
        .addBands(temp_band) \
        .addBands(days_band) \
        .addBands(date_band) \
        .addBands(weight_band)


def _mask_clouds(image):
    """Use FMASK attribute to mask clouds

    :param image: The image to mask clouds
    :type image: ee.Image
    """
    quality = image.select('fmask')
    cloud01 = quality.gt(2)
    cloudmask = image.mask().And(cloud01.Not())
    return image.updateMask(cloudmask)


def _day_of_year(image):
    """Determines the day of year of an image.

    :param image: The image.
    :type image: ee.Image

    :return: An int representing the day of year.
    """
    acquisition_timestamp = ee.Number(image.get('system:time_start'))
    return ee.Number(ee.Date(acquisition_timestamp).getRelative('day', 'year'))


def _days_between(day_of_year, another_day_of_year):
    """Calculates the days between two day of years.

    Result will always be positive, and might have wrapped over a year boundary.

    :param day_of_year: A day of year.
    :type day_of_year: ee.Number

    :param another_day_of_year: Another day of year.
    :type another_day_of_year: int

    :return: An int representing the days between the two day of years.
    """
    days_from_target_day = ee.Number(another_day_of_year).subtract(day_of_year).abs()
    days_from_target_day = ee.Number.min(
        days_from_target_day,
        ee.Number(365).subtract(days_from_target_day)  # Closer over year boundary?
    )
    return days_from_target_day


def _ndvi_band(image):
    """Creates a band (name: ndvi) with the NDVI of an image.

    :param image: The image.
    :type image: ee.Image

    :return: An ee.Image containing the NDVI.
    """
    return image.select('B4').subtract(image.select('B3')).divide(
        image.select('B4').add(image.select('B3'))
    ).rename(['ndvi'])


def _temp_band(image):
    """Creates a band (name: temp) with the image temperature.

    :param image: The image.
    :type image: ee.Image

    :return: An ee.Image containing the temperature.
    """
    return image.select('B10').focal_min().rename(['temp'])


def _days_band(days_from_target_day, image):
    """Creates a band (name: days) with the days from target day of year.

    :param image: The image.
    :type image: ee.Image

    :return: An ee.Image containing the days from target day of year.
    """
    return image.metadata('system:time_start').subtract(
        image.metadata('system:time_start')
    ).add(
        days_from_target_day
    ).rename(['days'])


def _date_band(image):
    """Creates a band (name: date) with the days since epoch.

    :param image: The image.
    :type image: ee.Image

    :return: An ee.Image containing the days since epoch.
    """
    return image.metadata('system:time_start').divide(_milis_per_day).rename(['date'])


def _normalized_ndvi(ndvi):
    """Normalizes the provided NDVI to be between 0 and 1.

    :param ndvi: The ndvi.
    :type ndvi: ee.Image

    :return: An ee.Image containing the normalized NDVI.
    """
    ndvi_normalized = ndvi.add(1).divide(2)
    return ndvi_normalized


def _normalized_temp(temp):
    """Normalizes the provided temperature to be between 0 and 1.

    0 represents 0 and 1 represents a temperature of 400.

    :param temp: The temperature.
    :type temp: ee.Image

    :return: An ee.Image containing the normalized temperature.
    """
    return temp.divide(400)


def _normalized_days_from_target_day(days_from_target_day):
    """Normalizes days from target day to be between 0 and 1.

     0 is exactly on the target day while 1 is half a year from the target day.

    :param days_from_target_day: Days from target day to normalize.
    :type days_from_target_day: ee.Number

    :return: An ee.Number with the normalized value.
    """
    return ee.Number(1).subtract(days_from_target_day.divide(183))


def _normalized_cloud_cover(image):
    """Normalizes the cloud cover to be between 0 and 1.

    1 represents no cloud cover while 0 is full cloud cover.

    :param image: The image.
    :type image: ee.Image

    :return: An ee.Image with the normalized cloud cover.
    """
    return image.metadata('CLOUD_COVER').divide(100).subtract(1).abs()


def _apply_toa_correction(image, image_day_of_year, bands):
    """Applies TOA correction to image on provided bands based on specified day of year.

    :param image: The image to apply TOA correction on.
    :type image: ee.Image

    :param image_day_of_year: The image's day of year.
    :type image_day_of_year: ee.Number

    :param bands: The bands to apply the correction to.
    :type bands: iterable

    :return: An ee.Image with the correction applied.
    """
    toa_correction = _calculate_toa_correction(image_day_of_year)
    bands_to_toa_correct = filter(lambda band: band in normalized_band_names, bands)
    adjusted_bands = []
    for band in bands_to_toa_correct:
        adjusted_bands.append(
            image.select(band).float().divide(toa_correction).multiply(10000)
        )
    result = image
    for adjusted in adjusted_bands:
        result = result.addBands(adjusted, overwrite=True)
    return result


def _calculate_toa_correction(day_of_year):
    """Correct TOA reflectance for sun angle per pixel.

    Following the equations from
    http://www.itacanet.org/the-sun-as-a-source-of-energy/part-3-calculating-solar-angles/
    and http://landsat.usgs.gov/Landsat8_Using_Product.php

    :param day_of_year: The day of year to calculate the correction for
    :type day_of_year: ee.Number

    :return: The correction as an ee.Number.
    """
    # Back to correcting for sun angle...
    # Setup degrees to radians conversion
    pi = ee.Number(3.14159265359)
    pipi = pi.multiply(2)
    deg2rad = pi.divide(180)
    # Calc precise day of year
    part2 = day_of_year.add(284).divide(36.25)
    # Calc declination angle
    part22 = pipi.multiply(part2)
    part222 = part22.sin()
    dec_angle = deg2rad.multiply(23.45).multiply(part222)
    # Hour angle
    hour_angle = deg2rad.multiply(-22.5)
    # Per-pixel latitude and longitude
    # latlon = ee.Image.pixelLonLat()
    lat = ee.Image.pixelLonLat().select('latitude').multiply(deg2rad)
    # Solar elevation angle
    cosh = hour_angle.cos()
    cosd = dec_angle.cos()
    coslat = lat.cos()
    sind = dec_angle.sin()
    sinlat = lat.sin()
    solar_elev1 = coslat.multiply(cosd).multiply(cosh)
    solar_elev2 = sinlat.multiply(sind)
    solar_elev = solar_elev1.add(solar_elev2)
    toa_cor2 = solar_elev.sin()
    return toa_cor2


def _collection_name(scene_id):
    """Determines the collection name of the specified scene id.

    :param scene_id: The scene id to find collection name for.
    :type scene_id: str

    :return: A str with the collection name.
    """
    prefix = scene_id[:3]
    return _collection_name_by_scene_id_prefix[prefix]


def _merge_image_collections(collection_a, collection_b):
    """Merges two image collections into a single image collection, making sure band names are preserved.

    This expects both collections to have normalized band names.

    :param collection_a: First image collection.
    :type collection_a: ee.ImageCollection

    :param collection_b: Second image collection.
    :type collection_b: ee.ImageCollection

    :return: An ee.ImageCollection containing the elements from both collections.
    """
    return ee.ImageCollection(
        collection_a.merge(collection_b).set('bands', normalized_band_names))


def _normalize_band_names(image, collection_name):
    """Normalizes the band names of the provided image.

    :param image: The image to normalize the band names for.
    :type image: ee.Image

    :param collection_name: The image collection name of the image.
    :type collection_name: str

    :return: An ee.Image with normalized band names.
    """
    return image.select(_bands_by_collection_name[collection_name], normalized_band_names)


def _flatten(iterable):
    """Flattens the provided iterable.

    The provided iterable and any nested iterable have their contents added to a list.

    :param iterable: The iterable to flatten.
    :type iterable: iterable

    :return: A flattened list
    """
    return [item for sublist in iterable for item in sublist]


def _to_image(image_id):
    """Retrieves an image with the specified id from the GEE landsat collections.

    :param image_id: The id of the image to retrieve.
    :type image: str

    :return: An ee.Image or None if the image isn't found.
    """
    # Merges all collections into a single collection
    collection = ee.ImageCollection('LANDSAT/LC8_L1T_TOA_FMASK').merge(
        ee.ImageCollection('LANDSAT/LE7_L1T_TOA_FMASK').merge(
            ee.ImageCollection('LANDSAT/LT5_L1T_TOA_FMASK').merge(
                ee.ImageCollection('LANDSAT/LT4_L1T_TOA_FMASK')
            )
        )
    )
    # Finds the image with the specified id in the collection
    # noinspection PyTypeChecker
    return collection.filter(
        ee.Filter.eq('system:index', image_id)
    ).first()
