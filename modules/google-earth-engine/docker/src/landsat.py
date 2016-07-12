import ee
from itertools import groupby

_collection_names_by_sensor = {
    'LANDSAT_8': ['LC8_L1T_TOA'],
    'LANDSAT_ETM_SLC_OFF': ['LE7_L1T_TOA'],
    'LANDSAT_ETM': ['LE7_L1T_TOA'],
    'LANDSAT_TM': ['LT4_L1T_TOA', 'LT5_L1T_TOA'],
}
_collection_name_by_scene_id_prefix = {
    'LC8': 'LC8_L1T_TOA',
    'LE7': 'LE7_L1T_TOA',
    'LT5': 'LT5_L1T_TOA',
    'LT4': 'LT4_L1T_TOA',
}

_bands_by_collection_name = {
    'LC8_L1T_TOA': ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B10'],
    'LE7_L1T_TOA': ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B6_VCID_1'],
    'LT5_L1T_TOA': ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B6'],
    'LT4_L1T_TOA': ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B6']
}

_normalized_band_names = ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B10']
_milis_per_day = 1000 * 60 * 60 * 24


def create_mosaic(
        aoi,
        sensors,
        target_day_of_year,
        from_day_of_year,
        to_day_of_year,
        from_date,
        to_date,
        bands):
    """Creates a cloud-free mosaic.

    :param aoi: The aoi to create the mosaic for.
    :type aoi: ee.Geometry

    :param sensors: The sensors to include imagery from.
    :type sensors: iterable
         """
    max_cloud_cover = 99
    filter = _collection_filter(aoi, from_date, from_day_of_year, max_cloud_cover, to_date, to_day_of_year)
    image_collection = _create_merged_image_collection(sensors, filter)
    mosaic = _create_mosaic(image_collection, aoi, target_day_of_year, bands)
    return mosaic.select(bands)


def create_mosaic_from_scenes(
        aoi,
        sceneIds,
        target_day_of_year,
        bands):
    grouped = groupby(sorted(sceneIds), _collection_name)
    collections = [_create_collection(name, ids) for name, ids in grouped]
    merged_collection = reduce(_merge_image_collections, collections)
    mosaic = _create_mosaic(merged_collection, aoi, target_day_of_year, bands)
    return mosaic.select(bands)


def _create_mosaic(image_collection, aoi, target_day_of_year, bands):
    image_collection_qa = image_collection.map(
        # lambda image: _adjust_image(image, target_day_of_year, bands)
        lambda image: _addqa(image, target_day_of_year, bands)
    )
    # Create a 'best pixel' composite using the warmest, wettest pixel closest to
    # specified target date
    mosaic = image_collection_qa.qualityMosaic('cweight')
    # clip the water bodies according to GFC Water Mask
    gfc_image = ee.Image('UMD/hansen/global_forest_change_2013')
    gfc_watermask = gfc_image.select(['datamask'])  # 0 = no data, 1 = mapped land, 2 = water
    mosaic_mask = mosaic.mask(gfc_watermask.neq(2)).clip(aoi).int16()
    return mosaic_mask


def _collection_name(scene_id):
    prefix = scene_id[:3]
    return _collection_name_by_scene_id_prefix[prefix]


def get_scenes_in_mosaic(
        aoi,
        sensors,
        target_day_of_year,
        from_day_of_year,
        to_day_of_year,
        from_date,
        to_date):
    """Returns the scenes required to create a cloud-free mosaic.

    :param aoi: The aoi to create the mosaic for.
    :type aoi: ee.Geometry

    :param target_date: The ideal date to generate the mosaic for.
    :type target_date: datetime.date

    :param sensors: The sensors to include imagery from.
    :type sensors: iterable

    :param years: The number of years to include imagery from.
    :type years: int

    :param bands: A list of the bands to include in the mosaic.
    :type bands: iterable
         """
    # TODO: Implement...
    return ['LC81910312016137LGN00',
            'LE71910312016097NSG00',
            'LC81920302016176LGN00',
            'LE71920302016152NSG00',
            'LE71910302016097NSG00',
            'LC81910302016105LGN00',
            'LC81900312016178LGN00',
            'LE71900312016106NSG00',
            'LC81900312016098LGN00']


def _collection_filter(aoi, from_date, from_day_of_year, max_cloud_cover, to_date, to_day_of_year):
    bounds_filter = ee.Filter.geometry(aoi)
    date_filter = ee.Filter.date(from_date, to_date)
    doy_of_year_filter = ee.Filter.calendarRange(from_day_of_year, to_day_of_year)
    # noinspection PyTypeChecker
    cloud_cover_filter = ee.Filter.lt('CLOUD_COVER', max_cloud_cover)
    filter = ee.Filter.And(
        bounds_filter,
        date_filter,
        doy_of_year_filter,
        cloud_cover_filter,
    )
    # TODO: Remove L08xxx
    return filter


def _adjust_image(image, target_day_of_year, bands):
    image_day_of_year = _day_of_year(image)
    ndvi_normalized = _normalized_ndvi(image)
    days_from_target_day = _days_from_target_year(image_day_of_year, target_day_of_year)
    day_of_year_normalized = _normalized_day_of_year(days_from_target_day)
    cloud_cover_normalized = _normalized_cloud_cover(image)

    date_band = image.metadata('system:time_start').divide(_milis_per_day).rename(['date'])
    temp_band = image.select('B10').focal_min().rename(['temp'])
    temp_normalized = temp_band.divide(400)
    days_band = _create_days_band(days_from_target_day, image)

    weight_band = ndvi_normalized.multiply(9) \
        .add(temp_normalized.multiply(3)) \
        .add(day_of_year_normalized.multiply(1)) \
        .add(cloud_cover_normalized.multiply(1)) \
        .rename(['cweight'])

    result = _apply_toa_correction(image, image_day_of_year, bands)
    return result \
        .addBands(date_band) \
        .addBands(temp_band) \
        .addBands(days_band) \
        .addBands(weight_band)


def _day_of_year(image):
    acquisition_timestamp = ee.Number(image.get('system:time_start'))
    return ee.Number(ee.Date(acquisition_timestamp).getRelative('day', 'year'))


def _normalized_cloud_cover(image):
    cloud_cover_normalized = image.metadata('CLOUD_COVER').divide(100).add(-1)
    return cloud_cover_normalized


def _normalized_day_of_year(days_from_target_day):
    day_of_year_normalized = ee.Number(1).subtract(days_from_target_day.divide(183))
    return day_of_year_normalized


def _days_from_target_year(image_day_of_year, target_day_of_year):
    days_from_target_day = ee.Number(target_day_of_year).subtract(image_day_of_year).abs()
    days_from_target_day = ee.Number.min(
        days_from_target_day,
        ee.Number(365).subtract(days_from_target_day)  # Closer over year boundary?
    )
    return days_from_target_day


def _normalized_ndvi(image):
    ndvi = (
        image.select('B4').subtract(image.select('B3'))
    ).divide(
        image.select('B4').add(image.select('B3'))
    )
    ndvi_normalized = ndvi.add(1).divide(2)
    return ndvi_normalized


def _addqa(image, target_day_of_year, bands):
    """Add qa bands.

    :param image: The image to add qa bands to.
    :type image: ee.Image

    :param target_day_of_year: They day of the year to aim for.
    :type target_day_of_year: int

    :param bands: A list of the bands to include in the map.
    :type bands: iterable
    """

    # Use the specified target day also as a weight factor
    # theoretically to, again, help control the mosaic creation at the end
    # ...where images closer to the target date are favored
    timestamp = ee.Number(image.get('system:time_start'))
    image_day_of_year = ee.Number(ee.Date(timestamp).getRelative('day', 'year'))
    days_from_target_day = ee.Number(target_day_of_year).subtract(image_day_of_year).abs()
    # Closer to wrap over year boundary?
    days_from_target_day = days_from_target_day.min(
        ee.Number(365).subtract(days_from_target_day)
    )
    # 0 days from target day gives weight of 365, 183 days from target day gives weight 182
    days_from_target_day_weight = ee.Number(365).subtract(days_from_target_day)

    ndvi = (
        image.select('B4').subtract(image.select('B3'))
    ).divide(
        image.select('B4').add(image.select('B3'))
    )
    temp = image.select('B10').focal_min().rename(['temp'])
    tmpndvi = ndvi.multiply(temp)
    # time = ndvi.multiply(temp).rename(['date'])
    time = image.metadata('system:time_start').divide(_milis_per_day).rename(['date'])
    # Extract the cloud cover from Landsat metadata and use it as an inverse weight
    # e.g. to favor all pixels from an acquisition with low cloud cover
    # theoretically to help keep the resulting mosaic radiometrically uniform
    cloudweight = image.metadata('CLOUD_COVER').subtract(100).multiply(-1)
    total_weight = tmpndvi.multiply(days_from_target_day_weight).multiply(cloudweight).rename(['cweight'])

    result = _apply_toa_correction(image, image_day_of_year, bands)
    days_band = _create_days_band(days_from_target_day, image)

    return result \
        .addBands(time) \
        .addBands(temp) \
        .addBands(days_band) \
        .addBands(total_weight)


def _apply_toa_correction(image, image_day_of_year, bands):
    toa_correction = _toa_correction(image_day_of_year)
    adjusted_bands = []
    for band in _bands_to_toa_correct(bands):
        adjusted_bands.append(
            image.select(band).float().divide(toa_correction).multiply(10000)
        )
    result = image
    for adjusted in adjusted_bands:
        result = result.addBands(adjusted, overwrite=True)
    return result


def _create_days_band(days_from_target_day, image):
    return image.metadata('system:time_start').subtract(
        image.metadata('system:time_start')
    ).add(
        days_from_target_day
    ).rename(['days'])


def _bands_to_toa_correct(bands):
    return filter(lambda band: band in _normalized_band_names, bands)


def _toa_correction(image_day_of_year):
    """Correct TOA reflectance for sun angle per pixel.

    Following the equations from http://www.itacanet.org/the-sun-as-a-source-of-energy/part-3-calculating-solar-angles/
    and...http://landsat.usgs.gov/Landsat8_Using_Product.php

    :param image_day_of_year: creates
    :type image_day_of_year: ee.Number
    """

    # Back to correcting for sun angle...
    # Setup degrees to radians conversion
    pi = ee.Number(3.14159265359)
    pipi = pi.multiply(2)
    deg2rad = pi.divide(180)
    # Calc precise day of year
    part2 = image_day_of_year.add(284).divide(36.25)
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


def _create_merged_image_collection(sensors, filter):
    collection_names = set(_flatten(map(lambda sensor: _collection_names_by_sensor[sensor], sensors)))
    image_collections = [_create_image_collection(name, filter) for name in collection_names]
    return reduce(_merge_image_collections, image_collections)


def _merge_image_collections(collection_a, collection_b):
    return ee.ImageCollection(
        collection_a.merge(collection_b).set('bands', ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B10']))


def _create_image_collection(collection_name, filter):
    filtered_collection = ee.ImageCollection(collection_name).filter(filter)
    normalized_collection = filtered_collection.map(
        lambda image: _normalize_band_names(image, collection_name)
    )
    return normalized_collection


def _normalize_band_names(image, collection_name):
    return image.select(_bands_by_collection_name[collection_name], _normalized_band_names)


def _flatten(iterable):
    return [item for sublist in iterable for item in sublist]


def _create_collection(name, image_ids):
    image_list = ee.List(list(image_ids))
    images = image_list.map(_to_image).removeAll([None])
    collection = ee.ImageCollection(images)
    normalized_collection = collection.map(
        lambda image: _normalize_band_names(image, name)
    )
    return normalized_collection


def _to_image(image_id):
    collection = ee.ImageCollection('LC8_L1T_TOA').merge(
        ee.ImageCollection('LE7_L1T_TOA').merge(
            ee.ImageCollection('LT5_L1T_TOA').merge(
                ee.ImageCollection('LT4_L1T_TOA')
            )
        )
    )
    # noinspection PyTypeChecker
    return collection.filter(
        ee.Filter.eq('system:index', image_id)
    ).first()
