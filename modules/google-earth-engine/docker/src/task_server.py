import json
import logging
import os
from collections import namedtuple
from os import path
from threading import local

import ee
import oauth2client.client
import oauth2client.client
from flask import Flask, Blueprint, Response
from flask import request

from sepal import gee
from sepal.task import repository

logging.getLogger("werkzeug").setLevel(logging.ERROR)
logging.getLogger("googleapiclient.discovery").setLevel(logging.ERROR)
logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)
logger = logging.getLogger(__name__)
app = Flask(__name__)
http = Blueprint(__name__, __name__)
thread_local = local()
username = None
download_dir = None

sepal_host = None
sepal_username = None
sepal_password = None

earthengine_credentials_file = os.path.expanduser('~/.config/earthengine/credentials')

Context = namedtuple('Context', 'credentials, download_dir')


class AccessTokenCredentials(oauth2client.client.OAuth2Credentials):
    def __init__(self):
        super(AccessTokenCredentials, self).__init__(
            AccessTokenCredentials._read_access_token(),
            None, None, None, None, None, None
        )

    @staticmethod
    def create():
        if path.exists(earthengine_credentials_file) \
                and AccessTokenCredentials._read_access_token():
            return AccessTokenCredentials()
        else:
            return None

    @staticmethod
    def _read_access_token():
        return json.load(open(earthengine_credentials_file)).get('access_token')

    def _refresh(self, http):
        self.access_token = AccessTokenCredentials._read_access_token()

    def __str__(self):
        return 'AccessTokenCredentials()'


@http.before_request
def before():
    credentials = AccessTokenCredentials.create()
    if not credentials:
        credentials = gee.service_account_credentials
    logger.debug('Using credentials: ' + str(credentials))
    thread_local.context = Context(credentials=credentials, download_dir=download_dir)
    ee.InitializeThread(credentials)


@http.route('/healthcheck', methods=['GET'])
def healthcheck():
    return Response(json.dumps({'status': 'OK'}), mimetype='application/json')


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


def init(server_args):
    global username, download_dir, sepal_host, sepal_username, sepal_password
    username = server_args.username
    download_dir = server_args.download_dir
    sepal_host = server_args.sepal_host
    sepal_username = server_args.sepal_username
    sepal_password = server_args.sepal_password


def destroy():
    repository.close()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    parser.add_argument('--gee-email', required=True, help='Earth Engine service account email')
    parser.add_argument('--gee-key-path', required=True, help='Path to Earth Engine service account key')
    parser.add_argument('--sepal-host', required=True, help='Sepal server host, e.g. sepal.io')
    parser.add_argument('--sepal-username', required=True, help='Username to use when accessing sepal services')
    parser.add_argument('--sepal-password', required=True, help='Password to use when accessing sepal services')
    parser.add_argument('--username', required=True, help='Username of user executing tasks')
    parser.add_argument('--download-dir', required=True, help='Directory where downloaded data should be stored')
    args, unknown = parser.parse_known_args()
    init(args)
    app.register_blueprint(http)
    app.run(host='0.0.0.0', threaded=True, port=5002)

destroy()
