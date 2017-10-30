import logging

from flask import session, render_template
from flask_cors import CORS, cross_origin

from .. import app

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
    return render_template('project-add.html')

@app.route('/project-edit', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def project_edit():
    return render_template('project-edit.html')

@app.route('/collect-form', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def collect_form():
    return render_template('collect-form.html')

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
    return render_template('500.html'), 500
