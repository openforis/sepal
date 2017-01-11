import json
import logging

from flask import Flask, Blueprint, request, Response

import config
import layers
import raster
import render
from config import to_file

app = Flask(__name__)
http = Blueprint(__name__, __name__)


@http.route('/layers', methods=['GET'])
def list_layers():
    return json_response(layers.list_layers())


@http.route('/layers/order', methods=['POST'])
def order_layers():
    layers.reorder(json.loads(request.values['order']))
    return json_response({'status': 'OK'})


@http.route('/raster/band/count', methods=['GET'])
def band_count():
    return json_response(
        {'count': raster.band_count(to_file(request.values['path']))}
    )


@http.route('/raster/band/<band_index>', methods=['GET'])
def band_info(band_index):
    return json_response(
        raster.band_info(to_file(request.values['path']), int(band_index))
    )


@http.route('/raster/save', methods=['POST'])
def save_raster():
    layer = json.loads(request.values['layer'])
    bounds = layers.save_raster(layer)
    return json_response({'bounds': bounds})


@http.route('/shape/save', methods=['POST'])
def save_shape():
    layer = json.loads(request.values['layer'])
    bounds = layers.save_shape(layer)
    return json_response({'bounds': bounds})


@http.route('/layers/<layer_id>', methods=['DELETE'])
def remove_raster(layer_id):
    layers.remove_layer(layer_id)
    return json_response({'status': 'OK'})


@http.route('/layers/features/<lat>/<lng>')
def features(lat, lng):
    return json_response(layers.features(float(lat), float(lng)))


@http.route('/layer/<layer_id>/<z>/<x>/<y>.<fmt>')
def render_tile(layer_id, z, x, y, fmt):
    return Response(
        render.render_tile(layer_id, int(z), int(x), int(y), str(fmt)),
        mimetype=('image/%s' % fmt)
    )


def json_response(data):
    return Response(json.dumps(data), mimetype='application/json')


if __name__ == '__main__':
    logging.basicConfig(level=logging.WARNING)
    app.register_blueprint(http)
    app.run(
        host='0.0.0.0',
        port=config.server_port,
        threaded=True,
        debug=config.debug_mode
    )
