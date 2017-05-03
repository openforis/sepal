from ceo import app
import logging, argparse

if __name__ == '__main__':

    parser = argparse.ArgumentParser()
    parser.add_argument('--gmaps_api_key', action='store', default='', help='Google Maps API key')
    args, unknown = parser.parse_known_args()

    app.config['GMAPS_API_KEY'] = args.gmaps_api_key

    logging.basicConfig(level=app.config['LOGGING_LEVEL'])
    logging.getLogger('flask_cors').level = app.config['LOGGING_LEVEL']
    logging.getLogger('ceo').level = app.config['LOGGING_LEVEL']

    try:
        from gee_gateway import gee_gateway
        from flask_cors import CORS
        gee_gateway_cors = CORS(gee_gateway, origins=app.config['CO_ORIGINS'])
        app.register_blueprint(gee_gateway, url_prefix='/' + app.config['GEEG_API_URL'])
    except ImportError as e:
        pass

    app.run(debug=app.config['DEBUG'], port=app.config['PORT'], host=app.config['HOST'])
