def create(collection, region, bands=(
        'VV', 'VH', 'VV_VH', 'dayOfYear', 'daysFromTarget', 'unixTimeDays'
)):
    mosaic = collection.qualityMosaic('quality')
    mosaic = mosaic \
        .addBands([
        mosaic.select('VV').subtract(mosaic.select('VH')).rename('VV_VH')
    ])
    return mosaic.select(bands).clip(region).float()


def viz_params(bands):
    if isinstance(bands, str):
        bands = [band.strip() for band in bands.split(',')]
    key = ','.join(bands)
    return {
        'VV,VH,VV_VH': {'bands': 'VV,VH,VV_VH', 'min': [-20, -22, 3], 'max': [2, 0, 14]},
        'dayOfYear': {'bands': 'dayOfYear', 'min': 0, 'max': 366, 'palette': '00FFFF, 000099'},
        'daysFromTarget': {'bands': 'daysFromTarget', 'min': 0, 'max': 30, 'palette': '008000, FFFF00, FF0000'}
    }[key]
