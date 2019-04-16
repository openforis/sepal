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
            VH_min - Minimum VH;
            VH_mean - Mean VH;
            VH_median - Median VH;
            VH_max - Maximum VH;
            VH_stdDev - Standard deviation in VH;
            VV_median_VH_median - Ratio between VV_median and VH_median.

    """
    mosaic = collection.select(['VV', 'VH']).reduce(
        ee.Reducer.mean()
            .combine(ee.Reducer.median(), '', True)
            .combine(ee.Reducer.stdDev(), '', True)
            .combine(ee.Reducer.minMax(), '', True)
            .combine(ee.Reducer.percentile([20, 80]), '', True)
    )
    mosaic = mosaic.addBands([
        mosaic.select('VV_median').subtract(mosaic.select('VH_median')).rename(['VV_median_VH_median'])
    ])
    return mosaic.clip(region).float()


def viz_params(bands):
    """
    Returns default EE visualization params for specified bands.

    Args:
        bands: The bands to get visualization params for. Must be one of the following:
            VV_min, VV_mean, VV_median, VV_max, VV_stdDev, VH_min, VH_mean, VH_median, VH_max, VH_stdDev,
            VV_median_VH_median.

    Returns:
         Dictionary with visualization params.
    """
    if isinstance(bands, str):
        bands = [band.strip() for band in bands.split(',')]

    ranges = {
        'VV_min': [-25, 4],
        'VV_mean': [-18, 6],
        'VV_median': [-18, 6],
        'VV_max': [-17, 10],
        'VV_stdDev': [0, 5],
        'VH_min': [-34, 4],
        'VH_mean': [-27, 0],
        'VH_median': [-27, 0],
        'VH_max': [-26, 2],
        'VH_stdDev': [0, 6],
        'VV_median_VH_median': [2, 16]
    }
    min = [ranges[band][0] for band in bands]
    max = [ranges[band][1] for band in bands]
    return {'bands': bands, 'min': min, 'max': max}
