import math
from functools import reduce

import ee
from sepal.ee import dates

from . import _refined_lee
from . import _terrain_flattening


def create(
        region,
        orbits=('ASCENDING',),
        start_date=None,
        end_date=None,
        target_date=None,
        geometric_correction='ELLIPSOID',
        speckle_filter='NONE',
        outlier_removal='NONE',
        harmonics=None
):
    """Creates an ee.ImageCollection with Sentinel 1 imagery.

    Args:
        region: The region to include imagery within. (ee.Geometry)

        orbits:  The orbits to include. (string: ASCENDING and/or DESCENDING)

        start_date: (Optional) The earliest date to include images for (inclusive).
            Defaults to 6 months before target date if target date is specified,
            Can be a string (yyyy-mm-dd), python datetime, or millis timestamp.

        end_date: (Optional) The latest date to include images for (exclusive).
            Defaults to 6 months after target date if target date is specified,
            Can be a String (yyyy-mm-dd), python datetime, or millis timestamp.

        target_date: (Optional) The ideal acquisition date of imagery.

        geometric_correction: (Optional) The geometric correction to apply. Can be one of the following:
            NONE - No correction is applied;
            ELLIPSOID (default) - Ellipsoid correction (gamma0 correction) is applied;
            TERRAIN - Terrain correction is applied.

        speckle_filter: (Optional) Type of speckle filtering to apply. Can be one of the following:
            NONE - No speckle filtering is applied;
            BOXCAR - 30x30m boxcar filtering is applied;
            SNIC - Simple Non-Iterative Clustering is used to filter out speckle;
            REFINED_LEE - Refined Lee filtering is applied. This can be very slow, but often gives good results.

        outlier_removal: (Optional) Removes outliers from the image collection. Can be one of the following:
            NONE - No outlier removal is performed;
            MODERATE - Remove outliers
            AGGRESSIVE - Remove more outliers

        harmonics: (Optional) Calculates harmonics coefficients for the specified dependent band (VV or VH).
            If specified,
            'constant', 't', 'phase', 'amplitude', and 'residuals' bands. Each image in the collection will also get a
            'fitted' and 'residuals' band, with the fitted dependent value.

    Returns:
        an ee.ImageCollection with Sentinel 1 imagery with the following band:
            VV;
            VH;
            angle.

        If targetDate is specified, the following metadata bands are also include:
            dayOfYear - day of the year;
            daysFromTarget - days from the specified target date;
            quality - closeness to target date;
            unixTimeDays - days since unix epoch.

        If harmonics is specified, the following bands are also included:
            fitted - the fitted value for the time of the image
            residuals - the difference between the dependent and the fitted value.
    """
    days = 366 / 2
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
        return image \
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

    def snic_filter(image):
        bands = ['VV', 'VH']
        snic = ee.Algorithms.Image.Segmentation.SNIC(
            image=image.select(bands),
            size=8,
            compactness=5,
            connectivity=8,
            neighborhoodSize=16,
        ).select('.*_mean').rename(bands)
        return image.addBands(snic, None, True)

    def add_date_bands(image):
        date = image.date()
        day_of_year = date.getRelative('day', 'year')
        days_from_target = date.difference(ee.Date(target_date), 'day').abs()
        millisPerDay = 1000 * 60 * 60 * 24
        unix_time_days = date.millis().divide(millisPerDay)
        return image \
            .addBands(ee.Image(day_of_year).uint16().rename('dayOfYear')) \
            .addBands(ee.Image(days_from_target).uint16().rename('daysFromTarget')) \
            .addBands(ee.Image(days_from_target.multiply(-1)).int16().rename('quality')) \
            .addBands(ee.Image(unix_time_days).uint16().rename('unixTimeDays'))

    def add_harmonic_bands(image):
        t = ee.Image(
            image.date().difference(ee.Date('1970-01-01'), 'year')
        ).float().rename(['t'])
        time_radians = t.multiply(2 * math.pi)
        cos = time_radians.cos().rename('cos')
        sin = time_radians.sin().rename('sin')
        dependent = image.select(harmonics).rename('harmonicDependent')
        return image \
            .addBands(t) \
            .addBands(ee.Image.constant(1)) \
            .addBands(cos) \
            .addBands(sin) \
            .addBands(dependent)

    def pre_process(image):
        steps = []
        if geometric_correction == 'ELLIPSOID':
            steps.append(to_gamma0)
        elif geometric_correction == 'TERRAIN':
            steps.append(_terrain_flattening.apply)
            steps.append(mask_overlay)
        if speckle_filter == 'BOXCAR':
            steps.append(boxcar_filter)
        elif speckle_filter == 'SNC':
            steps.append(snic_filter)
        elif speckle_filter == 'REFINED_LEE':
            steps.append(_refined_lee.apply)
        if target_date:
            steps.append(add_date_bands)
        if harmonics:
            steps.append(add_harmonic_bands)
        steps.append(mask_borders)
        return reduce(lambda acc, process: process(acc), steps, image)

    def calculate_harmonics(collection):
        dependent = 'harmonicDependent'
        independents = ee.List(['constant', 't', 'cos', 'sin'])
        trend = collection \
            .select(independents.add(dependent)) \
            .reduce(ee.Reducer.linearRegression(numX=independents.length(), numY=1))

        trend_coefficients = trend.select('coefficients') \
            .arrayProject([0]) \
            .arrayFlatten([independents])

        residuals = trend.select('residuals') \
            .arrayProject([0]) \
            .arrayFlatten([['residuals']]) \
            .rename('residuals')

        phase = trend_coefficients \
            .select('cos') \
            .atan2(trend_coefficients.select('sin')) \
            .rename('phase')

        amplitude = trend_coefficients \
            .select('cos') \
            .hypot(trend_coefficients.select('sin')) \
            .rename('amplitude')

        def fit(image):
            fitted = image.select(independents) \
                .multiply(trend_coefficients) \
                .reduce('sum') \
                .rename('fitted')
            residuals = image.select(dependent) \
                .subtract(fitted) \
                .rename('residuals')
            return image \
                .addBands(fitted) \
                .addBands(residuals) \
                .float()

        fitted = collection.map(fit)
        harmonics = trend_coefficients.select(['constant', 't']) \
            .addBands(phase) \
            .addBands(amplitude) \
            .addBands(residuals) \
            .float() \
            .clip(region)

        return fitted.set('harmonics', harmonics)

    def mask_outliers(collection, std_devs):
        bands = ['VV', 'VH']
        reduced = collection.select(bands).reduce(
            ee.Reducer.median().combine(ee.Reducer.stdDev(), '', True)
        )
        median = reduced.select('.*_median')
        std_dev = reduced.select('.*_stdDev')
        threshold = std_dev.multiply(std_devs)
        masked_collection = collection.map(
            lambda image: image.updateMask(
                image.select(bands).subtract(median).abs().lte(threshold)
                    .reduce(ee.Reducer.min())
            )
        )
        return masked_collection

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
        collection = mask_outliers(collection, 3)
    elif outlier_removal == 'AGGRESSIVE':
        collection = mask_outliers(collection, 2.6)

    if harmonics:
        collection = calculate_harmonics(collection)

    bands = ['VV', 'VH', 'angle']
    if target_date:
        bands = bands + ['dayOfYear', 'unixTimeDays', 'quality']
    if harmonics:
        bands = bands + ['fitted', 'residuals']

    return collection.select(bands)
