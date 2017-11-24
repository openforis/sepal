import json
import logging
from collections import namedtuple
from os import path
from threading import local

import ee
import sys
from flask import Flask, Blueprint, Response
from flask import request

from sepal import gee
from sepal.download.file_credentials import FileCredentials
from sepal.task import repository

app = Flask(__name__)
http = Blueprint(__name__, __name__)
thread_local = local()

access_token_file = None

Context = namedtuple('Context', 'credentials, download_dir')


@http.before_request
def before():
    credentials = gee.service_account_credentials
    if path.exists(access_token_file):
        credentials = FileCredentials(access_token_file)
    else:
        logging.info('Access token file not found: ' + access_token_file)
    logging.info('Using credentials: ' + str(credentials))
    thread_local.context = Context(credentials=credentials, download_dir=sys.argv[3])
    ee.InitializeThread(credentials)


@http.route('/healthcheck', methods=['GET'])
def healthcheck():
    return '', 204


@http.route('/submit', methods=['POST'])
def submit():
    task_request = request.get_json()
    repository.submit(
        id=task_request['task'],
        module=task_request['module'],
        spec=task_request['spec'],
        context=thread_local.context
    )
    return '', 204


@http.route('/status', methods=['GET'])
def status():
    task_status = repository.status(request.values.get('task'))
    return Response(json.dumps(task_status), mimetype='application/json')


@http.route('/cancel', methods=['POST'])
def cancel():
    repository.cancel(request.values.get('task'))
    return '', 204


def init():
    global access_token_file
    access_token_file = sys.argv[5]

    global username
    username = sys.argv[4]


def destroy():
    repository.close()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    init()
    app.register_blueprint(http)
    app.run(host='0.0.0.0', threaded=True, port=5002)

destroy()
