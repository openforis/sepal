import json
import logging

import ee
import sys
from flask import Flask, Blueprint, Response, request
from oauth2client.service_account import ServiceAccountCredentials

from sepal import image_spec_factory
from sepal.download.download import Downloader
from sepal import credentials

app = Flask(__name__)
http = Blueprint(__name__, __name__)
drive_cleanup = None

downloader = None


@http.route('/healthcheck', methods=['GET'])
def healthcheck():
    return 'OK', 200


@http.route('/download', methods=['POST'])
def download():
    image = image_spec_factory.create(json.loads(request.values['image']))
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
