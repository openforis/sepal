import ee
from util import *

import constants
import mosaic_spec


def create(collection, mosaic_def):
    """Creates a quality mosaic.

    :param image_collection: The image collection to create a mosaic for.
        All collections must have normalized band names.
    :type image_collection: ee.ImageCollection

    :param mosaic_def: The specification of the mosaic to create.
    :type mosaic_def: mosaic_spec

    :return: An ee.Image.
    """
    collection = _mask_dark_or_bright(collection)
    thermal_max = collection.select(THERMAL).max().rename(['thermal_max'])

    def add_bands(image):
        days_from_target_date = _days_from_target_date(mosaic_def.target_day_of_year, image)
        target_day_quality = _target_day_quality(days_from_target_date)
        cloud_quality = _image_quality(image, thermal_max)
        quality = _weighted_quality(target_day_quality, cloud_quality, mosaic_def.target_day_of_year_weight)
        return image \
            .addBands(quality) \
            .addBands(_date_band(image)) \
            .addBands(_days_band(days_from_target_date))

    mosaic = collection.map(add_bands).qualityMosaic(QUALITY)
    return mosaic


def _mask_dark_or_bright(collection):
    fromPercentile = 25
    toPercentile = 75
    percentiles = collection.select(SWIR1).reduce(ee.Reducer.percentile([fromPercentile, toPercentile]))

    def apply_mask(image):
        band = image.select(SWIR1)
        return image.updateMask(
            band.gte(percentiles.select(SWIR1 + '_p' + str(fromPercentile))).And(
                band.lte(percentiles.select(SWIR1 + '_p' + str(toPercentile))))
        )

    return collection.map(apply_mask)


def _weighted_quality(quality1, quality2, weight):
    return quality1.multiply(weight) \
        .add(quality2.multiply(ee.Number(1).subtract(weight))) \
        .rename([QUALITY])


def _target_day_quality(days_from_target_date):
    return ee.Image(1).subtract(days_from_target_date.divide(183)).rename([QUALITY])


def _image_quality(image, thermal_max):
    def closeness(band1, band2):
        return image.normalizedDifference([band1, band2]) \
            .abs().multiply(-1).add(1)

    image = image.addBands(thermal_max)
    return ee.Image(0) \
        .add(closeness('thermal_max', THERMAL)
             .multiply(50)).rename([QUALITY])


def _days_from_target_date(target_day, image):
    acquisition_timestamp = ee.Number(image.get('system:time_start'))
    day_of_year = ee.Date(acquisition_timestamp).getRelative('day', 'year')
    days_from_target_day = ee.Number(target_day).subtract(day_of_year).abs()
    days_from_target_day = ee.Number.min(
        days_from_target_day,
        ee.Number(365).subtract(days_from_target_day)  # Closer over year boundary?
    )
    return days_from_target_day


def _days_band(days_from_target_day):
    return ee.Image(days_from_target_day).divide(constants.multiplier).float().rename([DAYS])


def _date_band(image):
    return image.metadata('system:time_start').divide(constants.milis_per_day) \
        .divide(constants.multiplier).float().rename([DATE])
