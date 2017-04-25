import os, shutil, logging, json, datetime, hashlib

from flask import session, request, redirect, url_for, jsonify, render_template, send_file
from flask_cors import CORS, cross_origin

from .. import app
from .. import mongo

from ..common.utils import import_sepal_auth, requires_auth, requires_role

from werkzeug.utils import secure_filename

import zipfile

logger = logging.getLogger(__name__)

@app.route('/api/project/<id>', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def projectById(id=None):
    project = mongo.db.projects.find({'id': id}, {'_id': False});
    return jsonify(project.serialize), 200

@app.route('/api/project', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def projects():
    projects = []
    if session.get('is_admin'):
        projects = mongo.db.projects.find({}, {'_id': False});
    else:
        projects = mongo.db.projects.find({'username': session.get('username')}, {'_id': False});
    return jsonify(list(projects)), 200

@app.route('/api/project/<id>/file/<filename>', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def projectFileByIdAndFilename(id=None, filename=None):
    project = mongo.db.projects.find_one({'id': id}, {'_id': False});
    name, ext = os.path.splitext(project['filename'])
    return send_file(os.path.join(app.config['UPLOAD_FOLDER'], name, filename), mimetype='text/xml', attachment_filename=filename, as_attachment=True)

@app.route('/api/project/add', methods=['POST'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def projectAdd():
    # check if the post request has the file part
    if 'file' not in request.files:
        print('No file part')
        return redirect(request.url)
    file = request.files['file']
    # if user does not select file, browser also submit a empty part without filename
    if file.filename == '':
        print('No selected file')
        return redirect(request.url)
    # if the file has the allowed extension
    if file and allowed_file(file.filename):
        # save the file
        filename = secure_filename(file.filename)
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        # extract the files
        name, ext = os.path.splitext(filename)
        extractDir = os.path.join(app.config['UPLOAD_FOLDER'], name)
        if not os.path.exists(extractDir):
            os.mkdir(extractDir)
            zip_ref = zipfile.ZipFile(os.path.join(app.config['UPLOAD_FOLDER'], filename), 'r')
            zip_ref.extractall(extractDir)
            zip_ref.close()
        # create the project
        username = session.get('username')
        data = request.form.to_dict()
        radius = data.get('radius')
        mongo.db.projects.insert({
            'id': generate_id(filename),
            'filename': filename,
            'username': username,
            'radius': int(radius),
            'upload_datetime': datetime.datetime.utcnow()
        });
    return redirect(url_for('project_list'))

@app.route('/api/project/remove', methods=['DELETE'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def projectRemove():
    id = request.json.get('project_id')
    project = mongo.db.projects.find_one({'id': id}, {'_id': False});
    if not project:
        return 'Error!', 500
    if project['username'] != session.get('username'):
        return 'Forbidden!', 403
    filename = project['filename']
    mongo.db.projects.delete_many({'id': id})
    os.remove(os.path.join(app.config['UPLOAD_FOLDER'], filename))
    name, ext = os.path.splitext(filename)
    shutil.rmtree(os.path.join(app.config['UPLOAD_FOLDER'], name))
    return 'OK', 200

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def generate_id(value):
    hash_object = hashlib.md5(value)
    return hash_object.hexdigest()