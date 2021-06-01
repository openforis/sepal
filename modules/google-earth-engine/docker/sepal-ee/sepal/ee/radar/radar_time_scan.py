import ee


def create(collection, region):
    """
    Creates a Sentinel 1 time-scan.

    Args:
        collection: Sentinel 1 ee.ImageCollection with at least 'VV', 'VH' bands.

        region: The region to clip the mosaic to.

    Returns:
        A clipped ee.Image with the following bands:
            VV_min - Minimum VV;
            VV_mean - Mean VV;
            VV_med - Median VV;
            VV_max - Maximum VV;
            VV_std - Standard deviation in VV;
            VV_cv - Coefficient of variation in VV;
            VH_min - Minimum VH;
            VH_mean - Mean VH;
            VH_med - Median VH;
            VH_max - Maximum VH;
            VH_std - Standard deviation in VH;
            VH_cv - Coefficient of variation in VH;
            ratio_VV_med_VH_med - Ratio between VV_med and VH_med;
            NDCV - Normalized difference between VV_cv and VH_cv.

    """
    reduced = collection \
        .select(['VV', 'VH']) \
        .map(lambda image: image.addBands(
                ee.Image(10).pow(image.divide(10)).rename(['VV_nat', 'VH_nat'])
            )
         ) \
        .reduce(
        ee.Reducer.mean()
            .combine(ee.Reducer.median(), '', True)
            .combine(ee.Reducer.stdDev(), '', True)
            .combine(ee.Reducer.minMax(), '', True)
            .combine(ee.Reducer.percentile([20, 80]), '', True)
    )
    mosaic = reduced\
        .addBands([
            reduced.select('VV_med').subtract(reduced.select('VH_med')).rename(['ratio_VV_med_VH_med'])
        ])\
        .addBands([
            reduced.select('VV_std').divide(reduced.select('VV_nat_mean')).log10().multiply(10).rename(['VV_cv'])
        ])\
        .addBands([
            reduced.select('VH_std').divide(reduced.select('VH_nat_mean')).log10().multiply(10).rename(['VH_cv'])
        ])
    mosaic = mosaic.addBands([
        mosaic.normalizedDifference(['VV_cv', 'VH_cv']).rename('NDCV')
    ])
    return mosaic \
        .select([
            'VV_min', 'VV_mean', 'VV_med', 'VV_max', 'VV_std', 'VV_cv',
            'VH_min', 'VH_mean', 'VH_med', 'VH_max', 'VH_std', 'VH_cv',
            'ratio_VV_med_VH_med', 'NDCV'
        ]) \
        .float() \
        .clip(region)
