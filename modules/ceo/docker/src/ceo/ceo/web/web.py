import logging

from flask import session, render_template
from flask_cors import CORS, cross_origin

from .. import app
from .. import mongo

from ..common.utils import import_sepal_auth, requires_auth

logger = logging.getLogger(__name__)

@app.route('/', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def index():
    return render_template('project-list.html')

@app.route('/project-add', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def project_add():
    planet_imagery = list(mongo.db.imagery.find({'owner': 'planet'}, {'_id': False}))
    return render_template('project-add.html', planet_imagery=planet_imagery)

@app.route('/project-edit', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def project_edit():
    planet_imagery = list(mongo.db.imagery.find({'owner': 'planet'}, {'_id': False}))
    return render_template('project-edit.html', planet_imagery=planet_imagery)

@app.route('/collect-cep', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def collect_form():
    return render_template('collect-cep.html')

@app.route('/collect-training-data', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def collect_training_data():
    return render_template('collect-training-data.html')

@app.errorhandler(401)
def unauthorized(e):
    return render_template('401.html'), 401

@app.errorhandler(404)
def not_found(e):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_server_error(e):
    return render_template('500.html', exception=e), 500
