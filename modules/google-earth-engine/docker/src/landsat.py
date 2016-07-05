import ee
from datetime import date


def createMosaic(
        aoi,
        target_date,
        sensors,
        years,
        bands):
    """Creates a cloud-free mosaic.

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

    :return: the mosaic
    :rtype: ee.Image
         """

    target_day_of_year = 260
    from_day_of_year = 200
    to_day_of_year = 300
    from_date = '2013-02-11'
    to_date = date.today().isoformat()
    max_cloud_cover = 1

    input = ee.ImageCollection('LC8_L1T_TOA').filter(
        _collection_filter(aoi, from_date, from_day_of_year, max_cloud_cover, to_date, to_day_of_year))

    mosaic1 = input.map(lambda image: _addqa(image, target_day_of_year, bands))
    # Create a 'best pixel' composite using the warmest, wettest pixel closest to
    # specified target date
    mosaic2 = mosaic1.qualityMosaic('cweight')

    # clip the water bodies according to GFC Water Mask
    gfc_image = ee.Image('UMD/hansen/global_forest_change_2013')
    gfc_watermask = gfc_image.select(['datamask'])  # 0 = no data, 1 = mapped land, 2 = water
    mosaic3 = mosaic2.mask(gfc_watermask.neq(2)).clip(aoi).int16()

    # Select the bands from the BIG mosaic
    return mosaic3.select(bands)


def getScenesInMosaic(
        aoi,
        target_date,
        sensors,
        years):
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
    return [
        'LC81910312016185LGN00',
        'LE71910312016177NSG00',
        'LC81920302016176LGN00',
        'LE71910302016177NSG00',
        'LC81900312016178LGN00']


def createMosaicFromScenes(scenes, bands):
    # TODO: Implement...
    return 'foo'


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
    return filter


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
    days_from_target_to_end_of_year = ee.Number(365).subtract(days_from_target_day)
    toa_correction = _toa_correction(image_day_of_year)
    adjustedBands = []
    for band in bands:
        adjustedBands.append(
            image.select(band).float().divide(toa_correction).multiply(10000)
        )
    ndvi = (
        image.select('B5').subtract(image.select('B4'))
    ).divide(
        image.select('B5').add(image.select('B4'))
    )
    temp = image.select('B10').focal_min().rename(['temp'])
    weight = ndvi.multiply(temp).rename(['weight'])
    # Extract the cloud cover from Landsat metadata and use it as an inverse weight
    # e.g. to favor all pixels from an acquisition with low cloud cover
    # theoretically to help keep the resulting mosaic radiometrically uniform
    cweight = image.metadata('CLOUD_COVER').subtract(100).multiply(-1)
    cweight2 = weight.multiply(days_from_target_to_end_of_year).multiply(cweight).rename(['cweight'])
    result = image
    for adjusted in adjustedBands:
        result = result.addBands(adjusted, overwrite=True)
    return result \
        .addBands(temp) \
        .addBands(weight) \
        .addBands(cweight2)


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
