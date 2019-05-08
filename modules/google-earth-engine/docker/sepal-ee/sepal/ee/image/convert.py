
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
