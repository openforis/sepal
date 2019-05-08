
def params(bands):
    """
    Returns default EE visualization params for specified three rgb bands or single band.

    Args:
        bands: The bands to get visualization params for. Must be one of the following:
            VV, VH, VV_VH (VV/VH ratio), dayOfYear, daysFromTarget.

    Returns:
         Dictionary with visualization params.
    """
    if isinstance(bands, str):
        bands = [band.strip() for band in bands.split(',')]
    params = {
        'VV_min': {'range': [-25, 4]},
        'VV_mean': {'range': [-18, 6]},
        'VV_median': {'range': [-18, 6]},
        'VV_max':{'range':  [-17, 10]},
        'VV_stdDev': {'range': [0, 5]},
        'VV_CV': {'range': [-6, 28]},
        'VH_min': {'range': [-34, 4]},
        'VH_mean': {'range': [-27, 0]},
        'VH_median': {'range': [-27, 0]},
        'VH_max': {'range': [-26, 2]},
        'VH_stdDev': {'range': [0, 6]},
        'VH_CV': {'range': [0, 35]},
        'VV_median_VH_median': {'range': [2, 16]},
        'NDCV': {'range': [-1, 1]},
        'VV': {'range': [-20, 2]},
        'VH': {'range': [-22, 0]},
        'VV_VH': {'range': [3, 14]},
        'constant': {'range': [-280, 215]},
        't': {'range': [-4, 4]},
        'phase': {'range': [-3.14, 3.14]},
        'amplitude': {'range': [0.5, 5]},
        'residuals': {'range': [0, 2.4], 'stretch': [1, 0.5]},
        'dayOfYear': {'range': [0, 366], 'palette': '00FFFF, 000099'},
        'daysFromTarget': {'range': [0, 183], 'palette': '008000, FFFF00, FF0000'},
    }

    min = [params[band]['range'][0] for band in bands]
    max = [params[band]['range'][1] for band in bands]
    stretch = [params[band].get('stretch') for band in bands]
    palette = params[bands[0]]['palette'] if len(bands) == 1 else None
    return {'bands': bands, 'min': min, 'max': max, 'stretch': stretch, 'palette': palette}


def hsv_params(bands):
    """
    Returns default EE visualization params for specified hsv bands.

    Args:
        bands: The bands to get visualization params for. Must be one of the following:
            VV, VV_min, VV_mean, VV_median, VV_max, VV_stdDev,VH, VH_min, VH_mean, VH_median, VH_max, VH_stdDev,
            VV_VH (VV/VH ratio), VV_median_VH_median, constant, t, phase, amplitude, residuals,
            dayOfYear, daysFromTarget.

    Returns:
         Dictionary with visualization params.
    """
    viz_params = params(bands)
    viz_params['hsv'] = True
    return viz_params


def hsv_to_rgb(image, viz_params):
    def _stretch(image, from_range, to_range):
        return image.expression('toMin + (i - fromMin) * (toMax - toMin) / (fromMax - fromMin)', {
            'fromMin': from_range[0],
            'fromMax': from_range[1],
            'toMin': to_range[0],
            'toMax': to_range[1],
            'i': image
        })

    stretch = viz_params.get('stretch', [])
    bands = viz_params['bands']
    if not stretch:
        stretch = []
    for i, to_range in enumerate(stretch):
        from_range = [viz_params['min'][i], viz_params['max'][i]]
        if not to_range:
            to_range = [0, 1]
        band = bands[i]
        stretched = _stretch(image.select(band), from_range, to_range)
        image = image.addBands(
            stretched.rename(band),
            None,
            True
        )
    return image.select(bands).hsvToRgb().float()
