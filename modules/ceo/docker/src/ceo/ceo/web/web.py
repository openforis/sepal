import logging

from flask import session, render_template
from flask_cors import CORS, cross_origin

from .. import app

from ..common.utils import import_sepal_auth, requires_auth, requires_role

logger = logging.getLogger(__name__)

@app.route('/', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def index():
    return render_template('index.html', username=session.get('username'), is_admin=session.get('is_admin'))

@app.route('/project-list', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def project_list():
    return render_template('project-list.html', username=session.get('username'), is_admin=session.get('is_admin'))

@app.route('/project-add', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def project_add():
    return render_template('project-add.html', username=session.get('username'), is_admin=session.get('is_admin'))

@app.route('/project-edit', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def project_edit():
    return render_template('project-edit.html', username=session.get('username'), is_admin=session.get('is_admin'))

@app.route('/collect-form', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def collect_form():
    return render_template('collect-form.html', username=session.get('username'), is_admin=session.get('is_admin'))
