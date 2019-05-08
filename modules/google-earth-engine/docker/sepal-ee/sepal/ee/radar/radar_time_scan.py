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
            VV_median - Median VV;
            VV_max - Maximum VV;
            VV_stdDev - Standard deviation in VV;
            VV_CV - Coefficient of variation in VV;
            VH_min - Minimum VH;
            VH_mean - Mean VH;
            VH_median - Median VH;
            VH_max - Maximum VH;
            VH_stdDev - Standard deviation in VH;
            VH_CV - Coefficient of variation in VH;
            VV_median_VH_median - Ratio between VV_median and VH_median;
            NDCV - Normalized difference between VV_CV and VH_CV.

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
            reduced.select('VV_median').subtract(reduced.select('VH_median')).rename(['VV_median_VH_median'])
        ])\
        .addBands([
            reduced.select('VV_stdDev').divide(reduced.select('VV_nat_mean')).log10().multiply(10).rename(['VV_CV'])
        ])\
        .addBands([
            reduced.select('VH_stdDev').divide(reduced.select('VH_nat_mean')).log10().multiply(10).rename(['VH_CV'])
        ])
    mosaic = mosaic.addBands([
        mosaic.normalizedDifference(['VV_CV', 'VH_CV']).rename('NDCV')
    ])
    return mosaic \
        .select([
            'VV_min', 'VV_mean', 'VV_median', 'VV_max', 'VV_stdDev', 'VV_CV',
            'VH_min', 'VH_mean', 'VH_median', 'VH_max', 'VH_stdDev', 'VH_CV',
            'VV_median_VH_median', 'NDCV'
        ]) \
        .clip(region) \
        .float()
