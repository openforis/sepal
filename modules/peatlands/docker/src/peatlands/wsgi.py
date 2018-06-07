from peatlands import app

def build_app(gmaps_api_key=''):

    app.config['GMAPS_API_KEY'] = gmaps_api_key

    return app
