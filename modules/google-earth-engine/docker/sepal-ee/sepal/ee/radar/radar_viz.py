def params(bands):
    """
    Returns default EE visualization params for specified three rgb bands or single band.

    Args:
        bands: The bands to get visualization params for. Must be one of the following:
            VV, VV_min, VV_mean, VV_med, VV_max, VV_std, VV_cv, VVfit, VV_res,
            VH, VH_min, VH_mean, VH_med, VH_max, VH_std, VH_cv, VHfit, VH_res,
            ratio_VV_VH, ratio_VV_med_VH_med, NDCV
            constant, t, phase, amplitude, residuals,
            dayOfYear, daysFromTarget.

    Returns:
         Dictionary with visualization params.
    """
    if isinstance(bands, str):
        bands = [band.strip() for band in bands.split(',')]
    params = {
        'VV': {'range': [-20, 0]},
        'VV_min': {'range': [-25, 0]},
        'VV_mean': {'range': [-20, 0]},
        'VV_med': {'range': [-20, 0]},
        'VV_max': {'range': [-17, 10]},
        'VV_std': {'range': [0, 5]},
        'VV_cv': {'range': [-6, 28]},
        'VVfit': {'range': [-22, 0]},
        'VV_res': {'range': [0, 2.4], 'stretch': [1, 0.5]},
        'VVt': {'range': [-4, 4]},
        'VV_phase': {'range': [-3.14, 3.14]},
        'VV_amp': {'range': [0.5, 5]},
        'VH': {'range': [-25, -5]},
        'VH_min': {'range': [-34, -5]},
        'VH_mean': {'range': [-25, -5]},
        'VH_med': {'range': [-25, -5]},
        'VH_max': {'range': [-26, 2]},
        'VH_std': {'range': [0, 6]},
        'VHfit': {'range': [-20, 2]},
        'VH_res': {'range': [0, 2.4], 'stretch': [1, 0.5]},
        'VHt': {'range': [-4, 4]},
        'VH_phase': {'range': [-3.14, 3.14]},
        'VH_amp': {'range': [0.5, 5]},
        'VH_cv': {'range': [0, 35]},
        'ratio_VV_med_VH_med': {'range': [1, 15]},
        'NDCV': {'range': [-1, 1]},
        'ratio_VV_VH': {'range': [1, 15]},
        'constant': {'range': [-280, 215]},
        'dayOfYear': {'range': [0, 366], 'palette': '00FFFF, 000099'},
        'daysFromTarget': {'range': [0, 183], 'palette': '008000, FFFF00, FF0000'},
    }

    min = [params[band]['range'][0] for band in bands]
    max = [params[band]['range'][1] for band in bands]
    stretch = [params[band].get('stretch') for band in bands]
    palette = params[bands[0]].get('palette') if len(bands) == 1 else None
    return {'bands': bands, 'min': min, 'max': max, 'stretch': stretch, 'palette': palette}


def hsv_params(bands):
    """
    Returns default EE visualization params for specified hsv bands.

    Args:
        bands: The bands to get visualization params for. Must be one of the following:
            VV, VV_min, VV_mean, VV_med, VV_max, VV_std, VV_cv,
            VVfit, VV_res, VV_const, VVt, VV_phase, VV_amp, VV_res,
            VH, VH_min, VH_mean, VH_med, VH_max, VH_std, VH_cv,
            VHfit, VH_res, VH_const, VHt, VH_phase, VH_amp, VH_res,
            ratio_VV_VH, ratio_VV_med_VH_med, NDCV
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
