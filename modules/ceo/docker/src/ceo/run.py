from ceo import app
import logging, argparse

if __name__ == '__main__':

    parser = argparse.ArgumentParser()
    parser.add_argument('--gmaps_api_key', action='store', default='', help='Google Maps API key')
    parser.add_argument('--digital_globe_api_key', action='store', default='', help='DigitalGlobe API key')
    parser.add_argument('--dgcs_connect_id', action='store', default='', help='DGCS Connect ID')
    args, unknown = parser.parse_known_args()

    app.config['GMAPS_API_KEY'] = args.gmaps_api_key
    app.config['DIGITALGLOBE_API_KEY'] = args.digital_globe_api_key
    app.config['DGCS_CONNECT_ID'] = args.dgcs_connect_id

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
