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
        harmonics_dependents=()
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

        harmonics_dependents: (Optional) Calculates harmonics coefficients for the specified list of dependent bands
            (VV and/or VH), and fit each image in the collection. The resulting collection will get a property named
            'harmonics', containing an ee.Image with the coefficients.

            If VV is included, 'VV_constant', 'VV_t', 'VV_phase', 'VV_amplitude', and 'VV_residuals' bands are added
            to the harmonics image, and 'VV_fitted', and 'VV_residuals' bands are added to each image in the collection
            If VH is included, the same bands are added with a 'VH_' prefix.

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

        If harmonics_dependents is a non-empty list, the following bands are also included:
            VV_fitted, VH_fitted - the fitted value for the time of the image.
            VV_residuals, VH_residuals - the difference between the dependent and the fitted value.
    """
    if harmonics_dependents is None:
        harmonics_dependents = []
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
        def add_for_dependent(dependent):
            t = ee.Image(
                image.date().difference(ee.Date('1970-01-01'), 'year')
            ).float().rename([dependent + '_t'])
            time_radians = t.multiply(2 * math.pi)
            cos = time_radians.cos().rename(dependent + '_cos')
            sin = time_radians.sin().rename(dependent + '_sin')
            return image \
                .addBands(t) \
                .addBands(ee.Image.constant(1).rename(dependent + '_constant')) \
                .addBands(cos) \
                .addBands(sin)

        return ee.Image([add_for_dependent(dependent) for dependent in harmonics_dependents])

    def pre_process(image):
        steps = []
        if geometric_correction == 'ELLIPSOID':
            steps.append(to_gamma0)
        elif geometric_correction == 'TERRAIN':
            steps.append(_terrain_flattening.apply)
            steps.append(mask_overlay)
        if speckle_filter == 'BOXCAR':
            steps.append(boxcar_filter)
        elif speckle_filter == 'SNIC':
            steps.append(snic_filter)
        elif speckle_filter == 'REFINED_LEE':
            steps.append(_refined_lee.apply)
        if target_date:
            steps.append(add_date_bands)
        if harmonics_dependents:
            steps.append(add_harmonic_bands)
        steps.append(mask_borders)
        return reduce(lambda acc, process: process(acc), steps, image)

    def calculate_harmonics(collection, dependent):
        independents = ee.List([dependent + '_constant', dependent + '_t', dependent + '_cos', dependent + '_sin'])
        trend = collection \
            .select(independents.add(dependent)) \
            .reduce(ee.Reducer.linearRegression(numX=independents.length(), numY=1))

        trend_coefficients = trend.select('coefficients') \
            .arrayProject([0]) \
            .arrayFlatten([independents])

        residuals = trend.select('residuals') \
            .arrayProject([0]) \
            .arrayFlatten([['residuals']]) \
            .rename(dependent + '_residuals')

        phase = trend_coefficients \
            .select(dependent + '_cos') \
            .atan2(trend_coefficients.select(dependent + '_sin')) \
            .rename(dependent + '_phase')

        amplitude = trend_coefficients \
            .select(dependent + '_cos') \
            .hypot(trend_coefficients.select(dependent + '_sin')) \
            .rename(dependent + '_amplitude')

        harmonics = trend_coefficients.select([dependent + '_constant', dependent + '_t']) \
            .addBands(phase) \
            .addBands(amplitude) \
            .addBands(residuals) \
            .float() \
            .clip(region)

        def fit_function(image):
            fitted = image.select(independents) \
                .multiply(trend_coefficients) \
                .reduce('sum') \
                .rename(dependent + '_fitted')
            residuals = image.select(dependent) \
                .subtract(fitted) \
                .rename(dependent + '_residuals')
            return image \
                .addBands(fitted) \
                .addBands(residuals) \
                .float()

        return {'image': harmonics, 'fit_function': fit_function}

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

    if harmonics_dependents:
        harmonics_dict_list = [calculate_harmonics(collection, dependent) for dependent in harmonics_dependents]
        harmonics = ee.Image([harmonics_dict['image'] for harmonics_dict in harmonics_dict_list])
        fit_functions = [harmonics_dict['fit_function'] for harmonics_dict in harmonics_dict_list]

        def fit_harmonics(image):
            return image.addBands([fit(image) for fit in fit_functions])

        collection = collection.map(fit_harmonics)
        collection = collection.set('harmonics', harmonics)

    bands = ['VV', 'VH', 'angle']
    if target_date:
        bands = bands + ['dayOfYear', 'daysFromTarget', 'unixTimeDays', 'quality']
    if harmonics_dependents:
        for dependent in harmonics_dependents:
            bands = bands + [dependent + '_fitted', dependent + '_residuals']

    return collection.select(bands)
