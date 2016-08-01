import logging
import os

import ee
import sys
from flask import Flask, request
from oauth2client.service_account import ServiceAccountCredentials

from download import Downloader

app = Flask(__name__)
downloader = None


@app.route('/download', methods=['POST'])
def download():
    downloader.start_download(request.values.get('task'))
    return '', 204


@app.route('/status', methods=['GET'])
def status():
    return '', 204


@app.route('/cancel', methods=['POST'])
def cancel():
    downloader.cancel(request.values.get('task'))
    return '', 204


def _destroy():
    if downloader:
        downloader.stop()


if __name__ == '__main__':
    scopes = ee.oauth.SCOPE + ' https://www.googleapis.com/auth/drive'
    credentials = ServiceAccountCredentials.from_p12_keyfile(sys.argv[1], sys.argv[2], 'notasecret', scopes)
    ee.Initialize(credentials)
    download_dir = sys.argv[3]
    debug_mode = len(sys.argv) > 4 and sys.argv[4] == 'debug'

    if not debug_mode or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        downloader = Downloader(
            credentials=credentials,
            download_dir=download_dir)

    if debug_mode:
        logging.basicConfig(level=logging.DEBUG)
        app.run(debug=True, threaded=True, port=5001)
    else:
        logging.basicConfig(level=logging.WARNING)
        app.run(host='0.0.0.0', threaded=True, port=5001)

_destroy()
