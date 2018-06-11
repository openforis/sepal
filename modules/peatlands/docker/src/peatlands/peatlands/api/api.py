import logging

from flask import request, jsonify
from flask_cors import CORS, cross_origin

from .. import app

from ..common.utils import import_sepal_auth, requires_auth, timeseries

@app.route('/api/get-timeseries', methods=['POST'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def getTimeseries():
    lat = request.json.get('lat')
    lng = request.json.get('lng')
    filename = app.config['TS_FILENAME']
    ts = timeseries(filename, lng, lat)
    return jsonify({
        'timeseries': ts,
        'regression': []
    }), 200
