from ceo import app
import logging, argparse

from flask import send_from_directory

if __name__ == '__main__':

    parser = argparse.ArgumentParser()
    parser.add_argument('--gmaps_api_key', action='store', default='', help='Google Maps API key')
    args = parser.parse_args()

    app.config['GMAPS_API_KEY'] = args.gmaps_api_key

    logging.basicConfig(level=app.config['LOGGING_LEVEL'])
    logging.getLogger('flask_cors').level = app.config['LOGGING_LEVEL']
    logging.getLogger('ceo').level = app.config['LOGGING_LEVEL']

    @app.route('/test/<path:path>')
    def send1(path):
        return send_from_directory('/data/cep', path)

    app.run(debug=app.config['DEBUG'], port=app.config['PORT'], host=app.config['HOST'])
