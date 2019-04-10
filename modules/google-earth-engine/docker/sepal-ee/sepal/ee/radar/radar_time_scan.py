import ee


def create(collection, region, bands):
    mosaic = collection.reduce(ee.Reducer.percentile([20, 50, 80]))
    return mosaic \
        .addBands([
            mosaic.select('VV_p50').subtract(mosaic.select('VH_p50')).rename('VV_p50_VH_p50')
        ]) \
        .addBands([
            mosaic.select('VV_p80').subtract(mosaic.select('VV_p20')).rename('VV_p80_p20')
        ]) \
        .clip(region)


def viz_params(bands):
    if isinstance(bands, str):
        bands = [band.strip() for band in bands.split(',')]
    key = ','.join(bands)
    return {
        'VV_p50,VH_p50,VV_p80_p20': {
            'bands': 'VV_p50,VH_p50,VV_p80_p20', 'min': [-15, -20, 0], 'max': [2, 0, 13]
        },
        'VV_p50,VH_p50,VV_p50_VH_p50': {
            'bands': 'VV_p50,VH_p50,VV_p50_VH_p50', 'min': [-20, -22, 3], 'max': [2, 0, 14]
        },
        'VV_p80,VV_p20,VV_p80_p20': {
            'bands': 'VV_p80,VV_p20,VV_p80_p20', 'min': [-18, -20, 1], 'max': [2, 2, 11]
        },
        'VV_p20,VH_p20,VV_p80_p20': {
            'bands': 'VV_p20,VH_p20,VV_p80_p20', 'min': [-20, -25, 1], 'max': [2, -3, 11]
        }
    }[key]
