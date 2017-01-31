import logging

from flask import Flask, send_from_directory

import config
from app import http

app = Flask(__name__, instance_relative_config=True)


@app.route('/')
def index():
    return send_from_directory('test-frontend', 'index.html')


if __name__ == '__main__':
    app.secret_key = config.session_key
    app.register_blueprint(http)
    logging.basicConfig(level=logging.WARNING)
    app.run(
        host='0.0.0.0',
        port=6776,
        threaded=True,
        debug=config.debug_mode
    )
