import ee

import brdf_correction
import constants
import toa_correction
import cloud_score
from util import *


def apply(image_collection, mosaic_def):
    return image_collection.map(lambda image: _adjust_image(image, mosaic_def))


def _adjust_image(image, mosaic_def):
    """Masks clouds, adjusts some bands and adds some new bands.

        * quality - quality based on temperature, wetness, days from target day of year, and cloud cover
        * date - days since epoch
        * days - days from target day of year
        * temp - temperature

    :param image: The image to adjust.
        All collections must have normalized band names.
    :type image: ee.Image

    :param mosaic_def: Mosaic parameters
    :type mosaic_def: LandsatMosaic

    :return: The adjusted ee.Image.
    """
    image = _apply_mask(image, mosaic_def.classes_to_mask)
    image = brdf.correct(image)
    image_day_of_year = _day_of_year(image)
    days_from_target_day = _days_between(image_day_of_year, mosaic_def.target_day_of_year)

    # Bands to add
    ndvi_band = _ndvi_band(image)
    temp_band = _temp_band(image)
    date_band = _date_band(image)
    days_band = _days_band(days_from_target_day, image)
    quality_band = _quality_band(image, mosaic_def, days_from_target_day, ndvi_band, temp_band)
    # quality_band = cloud_score.calculate(image)

    # image = toa_correction.apply(image, image_day_of_year)
    return image \
        .addBands(ndvi_band) \
        .addBands(temp_band) \
        .addBands(days_band) \
        .addBands(date_band) \
        .addBands(quality_band)


def _quality_band(image, mosaic_def, days_from_target_day, ndvi_band, temp_band):
    ndvi_normalized = _normalized_ndvi(ndvi_band)
    temp_normalized = _normalized_temp(temp_band)
    scene_cloud_cover_normalized = _scene_normalized_cloud_cover(image)
    days_from_target_day_normalized = _normalized_days_from_target_day(days_from_target_day)
    return ndvi_normalized.multiply(0) \
        .add(temp_normalized.multiply(1)) \
        .add(scene_cloud_cover_normalized.multiply(0)) \
        .add(days_from_target_day_normalized.multiply(mosaic_def.target_day_of_year_weight * 2 * 0)) \
        .rename([QUALITY])


def _apply_mask(image, classes_to_mask):
    """Use FMask attribute to mask provided classes.

    :param image: The image to mask
    :type image: ee.Image
    """
    fmask = image.select(FMASK)
    mask = image.mask()
    for class_to_mask in classes_to_mask:
        fmask_value_to_mask = constants.fmask_value_by_class_name[class_to_mask]
        mask = mask.And(fmask.neq(fmask_value_to_mask))

    return image.updateMask(mask)


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
    return image.select(NIR).subtract(image.select(RED)).divide(
        image.select(NIR).add(image.select(RED))
    ).rename([NDVI])


def _temp_band(image):
    """Creates a band (name: temp) with the image temperature.

    :param image: The image.
    :type image: ee.Image

    :return: An ee.Image containing the temperature.
    """
    return image.select(THERMAL).focal_min().rename([TEMP])


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
    ).rename([DAYS])


def _date_band(image):
    """Creates a band (name: date) with the days since epoch.

    :param image: The image.
    :type image: ee.Image

    :return: An ee.Image containing the days since epoch.
    """
    return image.metadata('system:time_start').divide(constants.milis_per_day).rename([DATE])


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


def _scene_normalized_cloud_cover(image):
    """Normalizes the cloud cover to be between 0 and 1.

    1 represents no cloud cover while 0 is full cloud cover.

    :param image: The image.
    :type image: ee.Image

    :return: An ee.Image with the normalized cloud cover.
    """
    return image.metadata('CLOUD_COVER').divide(100).subtract(1).abs()
