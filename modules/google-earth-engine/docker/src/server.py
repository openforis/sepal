import json
import logging

import ee
import sys
from flask import Flask, Blueprint, Response, request
from oauth2client.service_account import ServiceAccountCredentials

from sepal import Aoi, image_spec_factory
from sepal.download.drive_cleanup import DriveCleanup

app = Flask(__name__)
http = Blueprint(__name__, __name__)

drive_cleanup = None


@http.route('/preview', methods=['POST'])
def preview():
    image_spec = image_spec_factory.create(json.loads(request.values['image']))
    image_preview = image_spec.preview()
    return Response(json.dumps(image_preview), mimetype='application/json')


@http.route('/sceneareas')
def scene_areas():
    aoi = Aoi.create(json.loads(request.values['aoi']))
    areas = aoi.scene_areas('wrs-2')
    return Response(json.dumps(areas), mimetype='application/json')


def init():
    credentials = ServiceAccountCredentials.from_p12_keyfile(
        service_account_email=sys.argv[1],
        filename=sys.argv[2],
        private_key_password='notasecret',
        scopes=ee.oauth.SCOPE + ' ' + DriveCleanup.SCOPES)
    ee.Initialize(credentials)

    global drive_cleanup
    drive_cleanup = DriveCleanup(credentials)
    drive_cleanup.start()


def destroy():
    if drive_cleanup:
        drive_cleanup.stop()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    init()
    app.register_blueprint(http)
    app.run(host='0.0.0.0', threaded=True, port=5001)

destroy()
