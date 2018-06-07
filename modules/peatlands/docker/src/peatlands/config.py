DEBUG = False
PORT = 7767
HOST = '0.0.0.0'

CO_ORIGINS = '*'

import logging
LOGGING_LEVEL = logging.INFO

SESSION_SECRET_KEY = 'notasecret'

BASE = '/peatlands/'
PEATLANDS_URL = BASE
PEATLANDS_API_URL = PEATLANDS_URL + 'api'

#TS_FILENAME = '/home/rfontanarosa/gdal/smap_disag_1km_geo.tif'
TS_FILENAME = '/vsis3/sepal-data-public/smap_1km/smap_disag_1km_geo.tif'
