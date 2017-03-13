from datetime import datetime

from util import *

collection_name = 'COPERNICUS/S2'
default_strategy = 'median'
default_classes_to_mask = ['cloud-shadow', 'cloud', 'snow']
mosaic_strategies = {
    'median': lambda collection: collection.median(),
    'quality-band': lambda collection: collection.qualityMosaic('quality')
}


def _bands(*bands):
    return ', '.join(bands)


viz_by_bands = {
    'RED, GREEN, BLUE': lambda params: {'bands': _bands(RED, GREEN, BLUE), 'min': 500, 'max': 5000,
                                              'gamma': '2.0, 2.1, 1.8'},
    'NIR, RED, GREEN': lambda params: {'bands': _bands(NIR, RED, GREEN), 'min': 500, 'max': 5000,
                                             'gamma': 1.7},
    'NIR, SWIR1, RED': lambda params: {'bands': _bands(NIR, SWIR1, RED), 'min': 500, 'max': 5000,
                                             'gamma': 1.7},
    'SWIR2, NIR, RED': lambda params: {'bands': _bands(SWIR2, NIR, RED), 'min': 500, 'max': 5000,
                                             'gamma': 1.7},
    'SWIR2, SWIR1, RED': lambda params: {'bands': _bands(SWIR2, SWIR1, RED), 'min': 500, 'max': 5000,
                                               'gamma': 1.7},
    'SWIR2, NIR, GREEN': lambda params: {'bands': _bands(SWIR2, NIR, GREEN), 'min': 500, 'max': 5000,
                                               'gamma': 1.7},
    'temp': lambda params: {'bands': 'temp', 'min': 200, 'max': 400, 'palette': '0000FF, FF0000'},
    'cluster': lambda params: {'bands': 'cluster', 'min': 0, 'max': 5000},
    'date': lambda params: {
        'bands': 'date',
        'min': params['from_days_since_epoch'],
        'max': params['to_days_since_epoch'],
        'palette': '00FFFF, 000099'
    },
    'days': lambda params: {
        'bands': 'days',
        'min': 0,
        'max': 183,
        'palette': '00FF00, FF0000'
    },
}
epoch = datetime.utcfromtimestamp(0)
milis_per_day = 1000 * 60 * 60 * 24
