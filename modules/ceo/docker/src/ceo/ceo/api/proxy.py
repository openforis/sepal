import logging, requests

from flask import Response, stream_with_context
from flask_cors import cross_origin

from .. import app

from ..common.utils import import_sepal_auth, requires_auth

logger = logging.getLogger(__name__)

@app.route('/api/proxy/planet/<mosaic_name>/<z>/<x>/<y>', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def iati(mosaic_name, z, x, y):
    api_key = app.config.get('PLANET_API_KEY')
    mosaic_name = 'norway_carbon_monitoring_2018q1_mai_ndombe_rgb_analytic_mosaic'
    url = 'https://tiles.planet.com/basemaps/v1/planet-tiles/{0}/gmap/{1}/{2}/{3}.png?api_key={4}'.format(mosaic_name, z, x, y, api_key)
    req = requests.get(url, stream=True)
    return Response(stream_with_context(req.iter_content(chunk_size=2048)), content_type=req.headers['content-type'])
