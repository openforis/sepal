import math
from functools import reduce
from sepal.ee import dates
from datetime import datetime, timedelta

import ee

from . import _speckle_filter


def create(
        region,
        start_date=None,
        end_date=None,
        target_date=None,
        corrections=['GAMMA0'],
        mask=['LAYOVER'],
        speckle_filter='NONE',
        orbits=['ASCENDING']
):
    days = 366 / 2 if 'OUTLIERS' in mask else 20
    if target_date and not start_date:
        start_date = dates.subtract_days(target_date, days)

    if target_date and not end_date:
        end_date = dates.add_days(target_date, days)

    def to_gamma0(image):
        gamma0 = image.expression('i - 10 * log10(cos(angle * pi / 180))', {
            'i': image.select(['VV', 'VH']),
            'angle': image.select('angle'),
            'pi': math.pi
        })
        return image.addBands(gamma0, None, True)

    def mask_borders(image):
        angle = image.select('angle')
        return image \
            .updateMask(
            angle.gt(31).And(angle.lt(45))
        ) \
            .clip(image.geometry().buffer(-50))

    def add_date_bands(image):
        date = image.date()
        day_of_year = date.getRelative('day', 'year')
        days_from_target = date.difference(ee.Date(target_date), 'day').abs()
        millisPerDay = 1000 * 60 * 60 * 24
        unix_time_days = date.millis().divide(millisPerDay)
        return image \
            .addBands(ee.Image(day_of_year).uint16().rename('dayOfYear')) \
            .addBands(ee.Image(days_from_target).uint16().rename('daysFromTarget')) \
            .addBands(ee.Image(days_from_target.multiply(-1)).uint16().rename('quality')) \
            .addBands(ee.Image(unix_time_days).uint16().rename('unixTimeDays'))


    def pre_process(image):
        steps = []

        if 'GAMMA0' in corrections:
            steps.append(to_gamma0)
        # if 'TERRAIN' in corrections:
        #     steps.append(_terrain_correction.apply)
        # if 'LAYOVER' in mask:
        # steps.append(_overlay.mask)
        # if 'OUTLIERS' in mask:
        # steps.append(mask_outliers)
        if speckle_filter == 'BOXCAR':
            steps.append(_speckle_filter.apply)
        # elif speckle_filter == 'REFINED_LEE':
        #     steps.append(_speckle_filter.apply)

        steps.append(mask_borders)
        if target_date:
            steps.append(add_date_bands)

        return reduce(lambda acc, process: process(acc), steps, image)


    return ee.ImageCollection('COPERNICUS/S1_GRD') \
        .filterBounds(region) \
        .filterDate(start_date, end_date) \
        .filterMetadata('resolution_meters', 'equals', 10) \
        .filter(ee.Filter.eq('instrumentMode', 'IW')) \
        .filter(ee.Filter.And(
            ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'),
            ee.Filter.listContains('transmitterReceiverPolarisation', 'VH')
        )) \
        .filter(ee.Filter.Or(
            [ee.Filter.eq('orbitProperties_pass', orbit) for orbit in orbits]
            )) \
        .map(pre_process)
