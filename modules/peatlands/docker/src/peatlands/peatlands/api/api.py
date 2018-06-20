import logging

from flask import request, jsonify
from flask_cors import CORS, cross_origin

from .. import app

from ..common.utils import import_sepal_auth, requires_auth, timeseries

from gee_gateway.gee.utils import getTimeSeriesForPoint

@app.route('/api/get-timeseries', methods=['POST'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def getTimeseries():
    """  """
    lat = request.json.get('lat')
    lng = request.json.get('lng')
    filename = app.config['TS_FILENAME']
    ts = timeseries(filename, lng, lat)
    return jsonify({
        'timeseries': ts,
        'regression': []
    }), 200


@app.route('/api/get-indexes', methods=['POST'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def getIndexes():
    """  """
    lat = request.json.get('lat')
    lng = request.json.get('lng')

    point = {
        "type": "Point",
        "coordinates": [float(lng), float(lat)],
        "geodesic": True
    }

    timeseries = getTimeSeriesForPoint(point, dateFrom='2000-01-01')

    indexes = []

    for ts in timeseries:
        nir = float(ts['nir'])
        red = float(ts['red'])
        green = float(ts['green'])
        blue = float(ts['blue'])
        swir1 = float(ts['swir1'])
        swir2 = float(ts['swir2'])
        indexes.append({
            'NDVI': (nir - red) / (nir + red),
            'NDMI': (nir - swir1) / (nir + swir1),
            'NDWI': (green - nir) / (green + nir),
            'EVI': 2.5 * (nir - red) / (nir + 6.0 * red - 7.5 * blue + 1),
            'EVI2': 2.5 * (nir - red) / (nir + 2.4 * red + 1),
            'NBR': (nir - swir2) / (nir + swir2),
            'LSAVI': ((nir - red) / (nir + red + 0.5)) * (1 + 0.5),
            'date': ts['date']['value']
        })

    return jsonify({
        'indexes': indexes
    }), 200
