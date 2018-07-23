import logging

from flask import render_template
from flask_cors import CORS, cross_origin

from .. import app

from ..common.utils import import_sepal_auth, requires_auth

logger = logging.getLogger(__name__)

@app.route('/', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def index():
    return render_template('index.html')
