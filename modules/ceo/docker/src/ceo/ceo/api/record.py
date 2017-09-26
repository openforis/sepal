import os, logging, json, datetime

from flask import session, request, redirect, url_for, jsonify, render_template, send_file, abort
from flask_cors import cross_origin

from .. import app
from .. import mongo

from ..common.utils import import_sepal_auth, requires_auth, generate_id
from ..common.fusiontables import selectRow, getRowId, updateRow, insertRow, deleteRow, FTException

logger = logging.getLogger(__name__)

@app.route('/api/record/<id>', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def recordById(id=None):
    record = mongo.db.records.find_one({'id': id}, {'_id': False})
    if not record:
        abort(404)
    return jsonify(record), 200

@app.route('/api/record/project_id/<project_id>', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def recordsByProject(project_id=None):
    records = mongo.db.records.find({'project_id': project_id}, {'_id': False})
    return jsonify(list(records)), 200

@app.route('/api/record', methods=['POST'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def recordAdd():
    project = mongo.db.projects.find_one({'id': request.json.get('project_id')}, {'_id': False})
    if not project:
        return 'Not Found!', 404
    # security check
    if project['username'] != session.get('username') and not session.get('is_admin'):
        return 'Forbidden!', 403
    #
    mongo.db.records.insert({
        'id': generate_id(session.get('username') + request.json.get('project_id') + request.json.get('plot').get('id')),
        'value': request.json.get('value'),
        'project_id': request.json.get('project_id'),
        'username': session.get('username'),
        'update_datetime': datetime.datetime.utcnow(),
        'plot': {
            'id': request.json.get('plot').get('id'),
            'YCoordinate': request.json.get('plot').get('YCoordinate'),
            'XCoordinate': request.json.get('plot').get('XCoordinate')
        }
    })
    # fusiontables
    token = session.get('accessToken')
    fusionTableId = project.get('fusionTableId')
    if token and fusionTableId:
        data = {
            'id': request.json.get('plot').get('id'),
            'YCoordinate': request.json.get('plot').get('YCoordinate'),
            'XCoordinate': request.json.get('plot').get('XCoordinate')
        }
        data.update(request.json.get('value'))
        location = '%s %s' % (data['YCoordinate'], data['XCoordinate'])
        try:
            columns = selectRow(token, fusionTableId, data.get('id'))
            if columns:
                rowId = getRowId(token, fusionTableId, data.get('id'))
                if rowId:
                    updateRow(token, fusionTableId, data, columns, rowId, location=location)
                else:
                    insertRow(token, fusionTableId, data, columns, location=location)
        except FTException as e:
            pass
    return 'OK', 200

@app.route('/api/record/<id>', methods=['PUT'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def recordModify(id=None):
    record = mongo.db.records.find_one({'id': id}, {'_id': False})
    if not record:
        return 'Not Found!', 404
    # security check
    if record['username'] != session.get('username') and not session.get('is_admin'):
        return 'Forbidden!', 403
    # update the record
    record.update({
        'value': request.json.get('value'),
        'update_datetime': datetime.datetime.utcnow()
    })
    mongo.db.records.update({'id': id}, {'$set': record}, upsert=False)
    # fusiontables
    token = session.get('accessToken')
    project = mongo.db.projects.find_one({'id': record.get('project_id')}, {'_id': False})
    fusionTableId = project.get('fusionTableId')
    if token and fusionTableId:
        data = {
            'id': record.get('plot').get('id'),
            'YCoordinate': record.get('plot').get('YCoordinate'),
            'XCoordinate': record.get('plot').get('XCoordinate'),
        }
        data.update(request.json.get('value'))
        try:
            columns = selectRow(token, fusionTableId, data.get('id'))
            if columns:
                rowId = getRowId(token, fusionTableId, data.get('id'))
                if rowId:
                    updateRow(token, fusionTableId, data, columns, rowId)
                else:
                    insertRow(token, fusionTableId, data, columns)
        except FTException as e:
            pass
    return 'OK', 200

@app.route('/api/record/<id>', methods=['DELETE'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def recordDelete(id=None):
    record = mongo.db.records.find_one({'id': id}, {'_id': False})
    if not record:
        return 'Not Found!', 404
    # security check
    if record['username'] != session.get('username') and not session.get('is_admin'):
        return 'Forbidden!', 403
    #
    mongo.db.records.delete_many({'id': id})
    # fusiontables
    token = session.get('accessToken')
    project = mongo.db.projects.find_one({'id': record.get('project_id')}, {'_id': False})
    fusionTableId = project.get('fusionTableId')
    if token and fusionTableId:
        try:
            rowId = getRowId(token, fusionTableId, record.get('plot').get('id'))
            if rowId:
                deleteRow(token, fusionTableId, rowId)
        except FTException as e:
            pass
    return 'OK', 200
