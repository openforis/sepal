def create(collection, region):
    """
    Creates a Sentinel 1 quality mosaic.

    Args:
        collection: Sentinel 1 ee.ImageCollection with at least 'VV', 'VH', and 'quality' bands.

        region: The region to clip the mosaic to.

    Returns:
        A clipped ee.Image with all bands included in provided collection, and 'ratio_VV_VH'
        - the ratio between VV and VH.

    """
    mosaic = collection.qualityMosaic('quality')
    mosaic = mosaic \
        .addBands([
        mosaic.select('VV').subtract(mosaic.select('VH')).rename('ratio_VV_VH')
    ])
    return mosaic \
        .float() \
        .clip(region)
