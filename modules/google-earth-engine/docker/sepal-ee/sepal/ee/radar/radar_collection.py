import math
from functools import reduce
from sepal.ee import dates
from . import _terrain_flattening
from . import _refined_lee

import ee

def create(
        region,
        start_date=None,
        end_date=None,
        target_date=None,
        orbits=('ASCENDING',),
        geometric_correction='ELLIPSOID',
        speckle_filter='NONE',
        outlier_removal='NONE'
):
    days = 366 / 2 if outlier_removal != 'NONE' else 24
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
        total_slices = ee.Number(image.get('totalSlices'))
        slice_number = ee.Number(image.get('sliceNumber'))
        middle_slice = ee.Image(slice_number.gt(1).And(slice_number.lt(total_slices)))
        not_border = image.select('VV').mask().reduceNeighborhood(
            reducer=ee.Reducer.allNonZero(),
            kernel=ee.Kernel.circle(radius=500, units='meters')
        )
        angle = image.select('angle')
        return image\
            .updateMask(
                angle.gt(31).And(angle.lt(45)).And(middle_slice.Or(not_border))
            )

    def mask_overlay(image):
        return image.updateMask(
            image.select('layover').And(image.select('shadow'))
        )

    def boxcar_filter(image):
        filtered = image.select(['VV', 'VH']) \
            .reduceNeighborhood(ee.Reducer.mean(), ee.Kernel.square(30, 'meters')) \
            .rename(['VV', 'VH'])
        return image.addBands(filtered, None, True)

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
        if geometric_correction == 'ELLIPSOID':
            steps.append(to_gamma0)
        elif geometric_correction == 'TERRAIN':
            steps.append(_terrain_flattening.apply)
            steps.append(mask_overlay)
        if speckle_filter == 'BOXCAR':
            steps.append(boxcar_filter)
        elif speckle_filter == 'REFINED_LEE':
            steps.append(_refined_lee.apply)
        if target_date:
            steps.append(add_date_bands)
        steps.append(mask_borders)
        return reduce(lambda acc, process: process(acc), steps, image)

    def mask_outliers(collection, std_devs):
        percentiles = collection.reduce(ee.Reducer.percentile([10, 90]))
        p10 = percentiles.select('.*_p10')
        p90 = percentiles.select('.*_p90')
        clamped_collection = collection.map(
            lambda image: image.updateMask(image.gte(p10).And(image.lte(p90)))
        )
        std_dev = clamped_collection.reduce(ee.Reducer.stdDev())
        mean = p10.add(p90).divide(2)
        return collection.map(
            lambda image: image.updateMask(image.subtract(mean).abs().lte(std_dev.multiply(std_devs)))
        )

    collection = ee.ImageCollection('COPERNICUS/S1_GRD') \
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
    if outlier_removal == 'MODERATE':
        return mask_outliers(collection, 3)
    elif outlier_removal == 'AGGRESSIVE':
        return mask_outliers(collection, 2)
    else:
        return collection
