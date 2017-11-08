from ceo import app
import logging, argparse
from flask_cors import CORS

if __name__ == '__main__':

    parser = argparse.ArgumentParser()
    parser.add_argument('--gmaps_api_key', action='store', default='', help='Google Maps API key')
    parser.add_argument('--digital_globe_api_key', action='store', default='', help='DigitalGlobe API key')
    parser.add_argument('--dgcs_connect_id', action='store', default='', help='DGCS Connect ID')
    parser.add_argument('--planet_api_key', action='store', default='', help='Planet API key')
    parser.add_argument('--sepal_host', action='store', default='', help='SEPAL Host (Production, Test or Local)')
    parser.add_argument('--ee_account', action='store', default='', help='Google Earth Engine account')
    parser.add_argument('--ee_key_path', action='store', default='', help='Google Earth Engine key path')
    parser.add_argument('--ee_token_enabled', action='store_false')
    args, unknown = parser.parse_known_args()

    app.config['GMAPS_API_KEY'] = args.gmaps_api_key
    app.config['DIGITALGLOBE_API_KEY'] = args.digital_globe_api_key
    app.config['DGCS_CONNECT_ID'] = args.dgcs_connect_id
    app.config['PLANET_API_KEY'] = args.planet_api_key
    app.config['SEPAL_HOST'] = args.sepal_host
    app.config['EE_TOKEN_ENABLED'] = args.ee_token_enabled

    logging.basicConfig(level=app.config['LOGGING_LEVEL'])
    logging.getLogger('flask_cors').level = app.config['LOGGING_LEVEL']
    logging.getLogger('ceo').level = app.config['LOGGING_LEVEL']

    try:
        from gee_gateway import gee_gateway, gee_initialize
        if not args.ee_token_enabled:
            gee_initialize(ee_account=args.ee_account, ee_key_path=args.ee_key_path)
        gee_gateway_cors = CORS(gee_gateway, origins=app.config['CO_ORIGINS'])
        app.register_blueprint(gee_gateway, url_prefix='/' + app.config['GEEG_API_URL'])
    except ImportError as e:
        pass

    app.run(debug=app.config['DEBUG'], port=app.config['PORT'], host=app.config['HOST'])
