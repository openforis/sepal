def create(collection, region):
    """
    Creates a Sentinel 1 quality mosaic.

    Args:
        collection: Sentinel 1 ee.ImageCollection with at least 'VV', 'VH', and 'quality' bands.

        region: The region to clip the mosaic to.

    Returns:
        A clipped ee.Image with all bands included in provided collection, and 'VV_VH' - the ratio between VV and VH.

    """
    mosaic = collection.qualityMosaic('quality')
    mosaic = mosaic \
        .addBands([
        mosaic.select('VV').subtract(mosaic.select('VH')).rename('VV_VH')
    ])
    return mosaic.clip(region).float()


def viz_params(bands):
    """
    Returns default EE visualization params for specified bands.

    Args:
        bands: The bands to get visualization params for. Must be one of the following:
            VV, VH, VV_VH (VV/VH ratio), dayOfYear, daysFromTarget.

    Returns:
         Dictionary with visualization params.
    """

    if isinstance(bands, str):
        bands = [band.strip() for band in bands.split(',')]
    defaults = {
        'VV': {'range': [-20, 2]},
        'VH': {'range': [-22, 0]},
        'VV_VH': {'range': [3, 14]},
        'dayOfYear': {'range': [0, 366], 'palette': '00FFFF, 000099'},
        'daysFromTarget': {'range': [0, 183], 'palette': '008000, FFFF00, FF0000'},
    }
    min = [defaults[band]['range'][0] for band in bands]
    max = [defaults[band]['range'][1] for band in bands]
    palette = defaults[bands[0]]['palette'] if len(bands) == 1 else None
    return {'bands': bands, 'min': min, 'max': max, 'palette': palette}
