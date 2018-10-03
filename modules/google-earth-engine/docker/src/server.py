import json
import logging
import argparse

import ee
import sys
from flask import Flask, Blueprint, Response, request

from sepal import gee
from sepal import image_spec_factory
from sepal.aoi import Aoi
from sepal.drive.drive_cleanup import DriveCleanup

app = Flask(__name__)
http = Blueprint(__name__, __name__)
drive_cleanup = None

sepal_host = None
sepal_username = None
sepal_password = None


@http.before_request
def before():
    gee.init_ee()


@http.route('/healthcheck', methods=['GET'])
def healthcheck():
    try:
        ee.Feature(ee.Geometry.Point(0, 0)).getMapId()
    except Exception:
        logging.info('User not whitelisted. user: ' + str(request.headers.get('sepal-user', '[No sepal-user header]')))
        return 'NOT-WHITELISTED', 400
    return Response(json.dumps({'status': 'OK'}), mimetype='application/json')


@http.route('/preview', methods=['POST'])
def preview():
    image_spec = image_spec_factory.create(request.get_json())
    image_preview = image_spec.preview()
    return Response(json.dumps(image_preview), mimetype='application/json')


@http.route('/sceneareas')
def scene_areas():
    aoi = Aoi.create(json.loads(request.values['aoi']))
    areas = aoi.scene_areas(request.values['source'])
    return Response(json.dumps(areas), mimetype='application/json')


def init(server_args):
    global username, download_dir, sepal_host, sepal_username, sepal_password, drive_cleanup
    sepal_host = server_args.sepal_host
    sepal_username = server_args.sepal_username
    sepal_password = server_args.sepal_password

    drive_cleanup = DriveCleanup(gee.service_account_credentials)
    drive_cleanup.start()


def destroy():
    if drive_cleanup:
        drive_cleanup.stop()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument('--gee-email', required=True, help='Earth Engine service account email')
    parser.add_argument('--gee-key-path', required=True, help='Path to Earth Engine service account key')
    parser.add_argument('--sepal-host', required=True, help='Sepal server host, e.g. sepal.io')
    parser.add_argument('--sepal-username', required=True, help='Username to use when accessing sepal services')
    parser.add_argument('--sepal-password', required=True, help='Password to use when accessing sepal services')
    args, unknown = parser.parse_known_args()
    init(args)
    app.register_blueprint(http)
    app.run(host='0.0.0.0', threaded=True, port=5001)

destroy()
