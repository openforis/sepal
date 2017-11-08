import json
import logging
from os import path
from threading import local

import ee
import sys
from flask import Flask, Blueprint, Response
from flask import request

from sepal import gee
from sepal import image_spec_factory
from sepal.download.download import Downloader
from sepal.download.file_credentials import FileCredentials

app = Flask(__name__)
http = Blueprint(__name__, __name__)
drive_cleanup = None
thread_local = local()

downloader = None
access_token_file = None


@http.before_request
def before():
    credentials = gee.service_account_credentials
    if path.exists(access_token_file):
        credentials = FileCredentials(access_token_file)
    else:
        logging.info('Access token file not found: ' + access_token_file)
    logging.info('Using credentials: ' + str(credentials))
    thread_local.credentials = credentials
    ee.InitializeThread(credentials)


@http.route('/healthcheck', methods=['GET'])
def healthcheck():
    return 'OK', 200


@http.route('/download', methods=['POST'])
def download():
    image = image_spec_factory.create(json.loads(request.values['image']))
    destination = request.values['destination']
    taskId = image.download(request.values['name'], username, thread_local.credentials, destination, downloader)
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
    global access_token_file
    access_token_file = sys.argv[5]

    global username
    username = sys.argv[4]

    global downloader
    downloader = Downloader(
        download_dir=sys.argv[3])


def destroy():
    if downloader:
        downloader.stop()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    init()
    app.register_blueprint(http)
    app.run(host='0.0.0.0', threaded=True, port=5002)

destroy()
