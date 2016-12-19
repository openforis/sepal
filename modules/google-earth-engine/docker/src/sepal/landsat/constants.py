from datetime import datetime

default_strategy = 'median'
default_classes_to_mask = ['cloud-shadow', 'cloud', 'snow']
collection_names_by_sensor = {
    'LANDSAT_8': ['LANDSAT/LC8_L1T_TOA_FMASK'],
    'LANDSAT_ETM_SLC_OFF': ['LANDSAT/LE7_L1T_TOA_FMASK'],
    'LANDSAT_ETM': ['LANDSAT/LE7_L1T_TOA_FMASK'],
    'LANDSAT_TM': ['LANDSAT/LT4_L1T_TOA_FMASK', 'LANDSAT/LT5_L1T_TOA_FMASK'],
}
bands_by_collection_name = {
    'LANDSAT/LC8_L1T_TOA_FMASK': ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B10', 'fmask'],
    'LANDSAT/LE7_L1T_TOA_FMASK': ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B6_VCID_1', 'fmask'],
    'LANDSAT/LT5_L1T_TOA_FMASK': ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B6', 'fmask'],
    'LANDSAT/LT4_L1T_TOA_FMASK': ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B6', 'fmask']
}
collection_name_by_scene_id_prefix = {
    'LC8': 'LANDSAT/LC8_L1T_TOA_FMASK',
    'LE7': 'LANDSAT/LE7_L1T_TOA_FMASK',
    'LT5': 'LANDSAT/LT5_L1T_TOA_FMASK',
    'LT4': 'LANDSAT/LT4_L1T_TOA_FMASK',
}
normalized_band_names = ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B10', 'fmask']
mosaic_strategies = {
    'median': lambda collection: collection.median(),
    'quality-band': lambda collection: collection.qualityMosaic('cweight')
}
fmask_value_by_class_name = {
    'land': 0,
    'water': 1,
    'cloud-shadow': 2,
    'snow': 3,
    'cloud': 4
}
viz_by_bands = {
    'B3, B2, B1': lambda params: {'bands': 'B3, B2, B1', 'min': 500, 'max': 5000, 'gamma': '2.1, 2.0, 1.7'},
    'B4, B3, B2': lambda params: {'bands': 'B4, B3, B2', 'min': 200, 'max': 5000, 'gamma': 1.2},
    'B4, B5, B3': lambda params: {'bands': 'B4, B5, B3', 'min': 200, 'max': 5000, 'gamma': 1.2},
    'B7, B4, B3': lambda params: {'bands': 'B7, B4, B3', 'min': 200, 'max': 5000, 'gamma': 1.2},
    'B7, B5, B3': lambda params: {'bands': 'B7, B5, B3', 'min': 200, 'max': 5000, 'gamma': 1.2},
    'B7, B4, B2': lambda params: {'bands': 'B7, B4, B2', 'min': 200, 'max': 5000, 'gamma': 1.2},
    # 'B4_brdf, B5_brdf, B3_brdf': lambda params: {
    #     'bands': 'B4_brdf, B5_brdf, B3_brdf', 'min': 0, 'max': 150, 'gamma': '2.2, 0.9, 1.0'},
    'B4_brdf, B5_brdf, B3_brdf': lambda params: {
        'bands': 'B4_brdf, B5_brdf, B3_brdf', 'min': 0, 'max': 255, 'gamma': 2},
    # 'B7_brdf, B4_brdf, B3_brdf': lambda params: {
    #     'bands': 'B7_brdf, B4_brdf, B3_brdf', 'min': 0, 'max': 150, 'gamma': '0.9, 2.0, 1.0'},
    'B7_brdf, B4_brdf, B3_brdf': lambda params: {
        'bands': 'B7_brdf, B4_brdf, B3_brdf', 'min': 0, 'max': 255, 'gamma': 2},
    'B7_brdf, B5_brdf, B3_brdf': lambda params: {
        #     'bands': 'B7_brdf, B5_brdf, B3_brdf', 'min': 0, 'max': 150, 'gamma': '1.5, 1.5, 1.5'},
        # 'B7_brdf, B5_brdf, B3_brdf': lambda params: {
        'bands': 'B7_brdf, B5_brdf, B3_brdf', 'min': 0, 'max': 255, 'gamma': 2},
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
