import os, logging, json, datetime, hashlib

from flask import session, request, redirect, url_for, jsonify, render_template, send_file
from flask_cors import CORS, cross_origin

from .. import app
from .. import mongo

from ..common.utils import import_sepal_auth, requires_auth, requires_role

logger = logging.getLogger(__name__)

@app.route('/api/record/<id>', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def recordById(id=None):
    record = mongo.db.records.find_one({'id': id}, {'_id': False});
    return jsonify(record), 200

@app.route('/api/record/project_id/<project_id>/username/<username>', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def recordsByProjectAndUser(project_id=None, username=None):
    records = mongo.db.records.find({'project_id': project_id, 'username': username}, {'_id': False});
    return jsonify(list(records)), 200

@app.route('/api/record', methods=['POST'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def recordAdd():
    mongo.db.records.insert({
        'id': generate_id(session.get('username') + request.json.get('project_id') + request.json.get('plot').get('id')),
        'value': json.dumps(request.json.get('value')),
        'project_id': request.json.get('project_id'),
        'username': session.get('username'),
        'update_datetime': datetime.datetime.utcnow(),
        'plot': {
            'id': request.json.get('plot').get('id'),
            'YCoordinate': request.json.get('plot').get('YCoordinate'),
            'XCoordinate': request.json.get('plot').get('XCoordinate')
        }
    });
    return 'OK', 200

@app.route('/api/record/<id>', methods=['PUT'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
@requires_role('user')
def recordModify(id=None):
    mongo.db.records.update({'id': id}, {
        '$set': {
            'value': json.dumps(request.json.get('value')),
            'update_datetime': datetime.datetime.utcnow()
        }
    }, upsert=False)
    return 'OK', 200

def generate_id(value):
    hash_object = hashlib.md5(value)
    return hash_object.hexdigest()
