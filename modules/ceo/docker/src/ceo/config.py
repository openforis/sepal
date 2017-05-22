DEBUG = False
PORT = 7766
HOST = '0.0.0.0'

CO_ORIGINS = '*'

import logging
LOGGING_LEVEL = logging.INFO

UPLOAD_FOLDER = '/data/cep'
ALLOWED_EXTENSIONS = set(['cep'])

MONGO_DBNAME = 'ceo'

SESSION_SECRET_KEY = 'notasecret'

BASE = '/ceo/'

CEO_URL = BASE
CEO_API_URL = CEO_URL + 'api'

GEEG_API_URL = 'gee-gateway/api'
