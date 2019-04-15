import ee


def create(collection, region, bands=(
        'VV_min', 'VV_mean', 'VV_median', 'VV_max', 'VV_stdDev', 'VV_CV',
        'VH_min', 'VH_mean', 'VH_median', 'VH_max', 'VH_stdDev', 'VH_CV',
        'VV_median_VH_median'
)):
    mosaic = collection.reduce(
        ee.Reducer.mean()
            .combine(ee.Reducer.median(), '', True)
            .combine(ee.Reducer.stdDev(), '', True)
            .combine(ee.Reducer.minMax(), '', True)
            .combine(ee.Reducer.percentile([20, 80]), '', True)
    )
    return mosaic.addBands([
            mosaic.select('VV_median').subtract(mosaic.select('VH_median')).rename(['VV_median_VH_median'])
        ]).addBands([
            mosaic.select('VV_p80').subtract(mosaic.select('VV_p20')).rename(['VV_p80_p20'])
        ]).addBands([
            mosaic.select('VH_p80').subtract(mosaic.select('VH_p20')).rename(['VH_p80_p20'])
        ]) \
        .select(bands) \
        .clip(region) \
        .float()


def viz_params(bands):
    if isinstance(bands, str):
        bands = [band.strip() for band in bands.split(',')]

    ranges = {
        'VV_min':	[-25, 4],
        'VV_mean': [-18, 6],
        'VV_median': [-18, 6],
        'VV_max': [-17, 10],
        'VV_stdDev': [0, 5],
        'VH_min': [-34, 4],
        'VH_mean': [-27,0],
        'VH_median': [-27,0],
        'VH_max': [-26, 2],
        'VH_stdDev': [0, 6],
        'VV_median_VH_median': [2, 16]
    }
    min = [ranges[band][0] for band in bands]
    max = [ranges[band][1] for band in bands]
    return {'bands': bands, 'min': min, 'max': max}

