import math

import ee
from . import radar_collection

def create(collection, region, bands):
    percentiles = [0, 20, 50, 80]

    def normalized_difference(image, band1, band2):
        image1 = image.select(band1)
        image2 = image.select(band2)
        return image1.subtract(image2).divide(image1.add(image2)).clamp(-1, 1)

    
    mosaic = collection.reduce(ee.Reducer.percentile(percentiles))
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
        'VV_p50,VH_p50,VV_p80_p20': {'bands': 'VV_p50,VH_p50,VV_p80_p20', 'min': [-15, -20, 0], 'max': [2, 0, 13]},
        
        'VV_p50,VH_p50,VV_p50_VH_p50': {'bands': 'VV_p50,VH_p50,VV_p50_VH_p50', 'min': [-20, -22, 3], 'max': [2, 0, 14]},
        'VV_p80,VV_p20,VV_p80_p20': {'bands': 'VV_p80,VV_p20,VV_p80_p20', 'min': [-18, -20, 1], 'max': [2, 2, 11]},
        'VV_p20,VH_p20,VV_p80_p20': {'bands': 'VV_p20,VH_p20,VV_p80_p20', 'min': [-20, -25, 1], 'max': [2, -3, 11]}
    }[key]
