import json
import logging
import traceback

import sys
from flask import Flask, Blueprint, request, Response

import config
import layers
import raster
import render
from config import to_file

app = Flask(__name__)
http = Blueprint(__name__, __name__)
session_state = {'layer_by_id': {}, 'index_by_id': {}, 'renderers': {}}


@http.errorhandler(Exception)
def handle_invalid_usage(error):
    print(error)
    print_stacktrace()
    return "Internal Error", 500


@http.route('/layers', methods=['GET'])
def list_layers():
    return json_response(layers.list_layers(state()))


@http.route('/layers/order', methods=['POST'])
def order_layers():
    layers.reorder(json.loads(request.values['order']), state())
    return json_response({'status': 'OK'})


@http.route('/raster/info', methods=['GET'])
def raster_info():
    raster_file = to_file(request.values['path'])
    return json_response(
        {
            'bandCount': raster.band_count(raster_file),
            'nodata': raster.read_nodata(raster_file)
        }
    )


@http.route('/raster/band/<band_index>', methods=['GET'])
def band_info(band_index):
    nodata = request.values.get('nodata', None)
    if nodata:
        nodata = float(nodata)
    return json_response(
        raster.band_info(
            raster_file=to_file(request.values['path']),
            band_index=int(band_index),
            nodata=nodata)
    )


@http.route('/raster/save', methods=['POST'])
def save_raster():
    layer = json.loads(request.values['layer'])
    bounds = layers.save_raster(layer, state())
    return json_response({'bounds': bounds})


@http.route('/shape/save', methods=['POST'])
def save_shape():
    layer = json.loads(request.values['layer'])
    bounds = layers.save_shape(layer, state())
    return json_response({'bounds': bounds})


@http.route('/layers/<layer_id>', methods=['DELETE'])
def remove_raster(layer_id):
    layers.remove_layer(layer_id, state())
    return json_response({'status': 'OK'})


@http.route('/layers/features/<lat>/<lng>')
def attributes(lat, lng):
    return json_response(layers.features(float(lat), float(lng), state()))


@http.route('/layer/<layer_id>/<z>/<x>/<y>.<fmt>')
def render_tile(layer_id, z, x, y, fmt):
    return Response(
        render.render_tile(layer_id, int(z), int(x), int(y), str(fmt), renderers()),
        mimetype=('image/%s' % fmt)
    )


def state():
    return session_state


def renderers():
    return state().get('renderers', {})


def json_response(data):
    return Response(json.dumps(data), mimetype='application/json')


def print_stacktrace():
    exc_type, exc_value, exc_traceback = sys.exc_info()
    traceback.print_exception(exc_type, exc_value, exc_traceback)


if __name__ == '__main__':
    logging.basicConfig(level=logging.WARNING)
    app.config['PROPAGATE_EXCEPTIONS'] = True
    app.register_blueprint(http)
    app.secret_key = config.session_key
    app.run(
        host='0.0.0.0',
        port=config.server_port,
        threaded=True,
        debug=config.debug_mode
    )
