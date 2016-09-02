import json
import logging

import ee
import sys
from flask import Flask, Blueprint, Response, request
from oauth2client.service_account import ServiceAccountCredentials

from download import Downloader
from image import Image

app = Flask(__name__)
http = Blueprint(__name__, __name__)
drive_cleanup = None

downloader = None


@http.route('/healthcheck', methods=['GET'])
def healthcheck():
    return 'OK', 200


@http.route('/download', methods=['POST'])
def download():
    image = Image.create(json.loads(request.values['image']))
    taskId = image.download(request.values['name'], username, downloader)
    return Response(taskId, mimetype='text/plain')


@http.route('/status', methods=['GET'])
def status():
    task_status = downloader.status(request.values.get('task'))
    return Response(json.dumps(task_status), mimetype='application/json')


@http.route('/cancel', methods=['POST'])
def cancel():
    downloader.cancel(request.values.get('task'))
    return '', 204


def init():
    credentials = ServiceAccountCredentials.from_p12_keyfile(
        service_account_email=sys.argv[1],
        filename=sys.argv[2],
        private_key_password='notasecret',
        scopes=ee.oauth.SCOPE + ' https://www.googleapis.com/auth/drive')
    ee.Initialize(credentials)

    download_dir = sys.argv[3]
    global username
    username = sys.argv[4]
    global downloader
    downloader = Downloader(
        credentials=credentials,
        download_dir=download_dir)


def destroy():
    if downloader:
        downloader.stop()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    init()
    app.register_blueprint(http)
    app.run(host='0.0.0.0', threaded=True, port=5002)

destroy()
