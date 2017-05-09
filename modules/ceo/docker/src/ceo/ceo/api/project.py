import os, logging, json, datetime, zipfile, shutil, csv, time
import xml.etree.ElementTree as ET

from flask import Response, session, request, redirect, url_for, jsonify, render_template, send_file, abort
from flask_cors import cross_origin

from .. import app
from .. import mongo

from ..common.utils import import_sepal_auth, requires_auth, propertyFileToDict, allowed_file, generate_id, listToCSVRowString

from werkzeug.utils import secure_filename

logger = logging.getLogger(__name__)

@app.route('/api/project/<id>', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def projectById(id=None):
    project = mongo.db.projects.find_one({'id': id}, {'_id': False})
    if not project:
        abort(404)
    return jsonify(project), 200

@app.route('/api/project', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def projects():
    projects = []
    if session.get('is_admin'):
        projects = mongo.db.projects.find({}, {'_id': False})
    else:
        projects = mongo.db.projects.find({'username': session.get('username')}, {'_id': False})
    return jsonify(list(projects)), 200

@app.route('/api/project/<id>/file', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def projectFileById(id=None):
    project = mongo.db.projects.find_one({'id': id}, {'_id': False})
    filename = project['filename']
    name, ext = os.path.splitext(filename)
    return send_file(os.path.join(app.config['UPLOAD_FOLDER'], name, filename), mimetype='text/xml', attachment_filename=filename, as_attachment=True)

@app.route('/api/project', methods=['POST'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def projectAdd():
    # check if the post request has the file part
    if 'file' not in request.files:
        print('No file part')
        return 'KO', 400
    file = request.files['file']
    # if user does not select file, browser also submit a empty part without filename
    if file.filename == '':
        print('No selected file')
        return 'KO', 400
    # if the file has the allowed extension
    if file and allowed_file(file.filename, app.config['ALLOWED_EXTENSIONS']):
        # save the file
        filename = secure_filename(file.filename)
        name, ext = os.path.splitext(filename)
        uniqueName = name + '--' + str(int(time.time()))
        uniqueFilename =  uniqueName + ext
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], uniqueFilename))
        # extract the files
        extractDir = os.path.join(app.config['UPLOAD_FOLDER'], uniqueName)
        if not os.path.exists(extractDir):
            os.mkdir(extractDir)
            zip_ref = zipfile.ZipFile(os.path.join(app.config['UPLOAD_FOLDER'], uniqueFilename), 'r')
            zip_ref.extractall(extractDir)
            zip_ref.close()
        # codeLists
        codeLists = []
        if os.path.isfile(os.path.join(extractDir, 'placemark.idm.xml')):
            ns = {
                'of': 'http://www.openforis.org/idml/3.0'
            }
            tree = ET.parse(os.path.join(extractDir, 'placemark.idm.xml'))
            lists = tree.findall('of:codeLists/of:list', ns)
            for lst in lists:
                codeList = {
                    'id': lst.attrib.get('id'),
                    'name': lst.attrib.get('name'),
                    'items': []
                }
                items = lst.findall('of:items/of:item', ns)
                if len(items) > 0:
                    for item in items:
                        codeList.get('items').append({
                            'code': item.find('of:code', ns).text,
                            'label': item.find('of:label', ns).text
                        })
                    codeLists.append(codeList)
        #
        properties = propertyFileToDict(os.path.join(extractDir, 'project_definition.properties'))
        property = properties.get('csv', 'test_plots.ced')
        head, tail = os.path.split(property)
        # plots
        plots = []
        if os.path.isfile(os.path.join(extractDir, tail)):
            with open(os.path.join(extractDir, tail), 'rb') as csvfile:
                csvreader = csv.reader(csvfile, delimiter=',', quotechar='"')
                next(csvreader, None)
                for row in csvreader:
                    plots.append({
                        'id': row[0],
                        'YCoordinate': row[1],
                        'XCoordinate': row[2]
                    })
        # create the project
        username = session.get('username')
        name = request.form.get('name')
        radius = request.form.get('radius', type=int)
        overlays = []
        # layers
        layerType = request.form.getlist('layerType[]')
        layerName = request.form.getlist('layerName[]')
        collectionName = request.form.getlist('collectionName[]')
        dateFrom = request.form.getlist('dateFrom[]')
        dateTo = request.form.getlist('dateTo[]')
        Min = request.form.getlist('min[]')
        Max = request.form.getlist('max[]')
        band1 = request.form.getlist('band1[]')
        band2 = request.form.getlist('band2[]')
        band3 = request.form.getlist('band3[]')
        mapID = request.form.getlist('mapID[]')
        index1 = index2 = -1
        for i in range(0, len(layerType)):
            overlay = None
            if layerType[i] == 'gee-gateway':
                index1 += 1
                overlay = {
                    'layerName': layerName[i],
                    'type': layerType[i],
                    'collectionName': collectionName[index1],
                    'dateFrom': dateFrom[index1],
                    'dateTo': dateTo[index1],
                    'min': Min[index1],
                    'max': Max[index1],
                    'band1': band1[index1],
                    'band2': band2[index1],
                    'band3': band3[index1]
                }
            elif layerType[i] == 'digitalglobe':
                index2 += 1
                overlay = {
                    'layerName': layerName[i],
                    'type': layerType[i],
                    'mapID': mapID[index2]
                }
            if overlay:
                overlays.append(overlay)
        # validation
        if not name or not radius:
            return 'KO', 400
        # insert the project
        mongo.db.projects.insert({
            'id': generate_id(uniqueFilename),
            'name': name,
            'type': 'CEP',
            'filename': uniqueFilename,
            'username': username,
            'radius': radius,
            'upload_datetime': datetime.datetime.utcnow(),
            'plots': plots,
            'codeLists': codeLists,
            'overlays': overlays
        })
    return redirect(app.config['BASE'])

@app.route('/api/project/<id>', methods=['PUT'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def projectModify(id=None):
    #
    name = request.form.get('name')
    radius = request.form.get('radius', type=int)
    overlays = []
    # layers
    layerType = request.form.getlist('layerType[]')
    layerName = request.form.getlist('layerName[]')
    collectionName = request.form.getlist('collectionName[]')
    dateFrom = request.form.getlist('dateFrom[]')
    dateTo = request.form.getlist('dateTo[]')
    Min = request.form.getlist('min[]')
    Max = request.form.getlist('max[]')
    band1 = request.form.getlist('band1[]')
    band2 = request.form.getlist('band2[]')
    band3 = request.form.getlist('band3[]')
    mapID = request.form.getlist('mapID[]')
    index1 = index2 = -1
    for i in range(0, len(layerType)):
        overlay = None
        if layerType[i] == 'gee-gateway':
            index1 += 1
            overlay = {
                'layerName': layerName[i],
                'type': layerType[i],
                'collectionName': collectionName[index1],
                'dateFrom': dateFrom[index1],
                'dateTo': dateTo[index1],
                'min': Min[index1],
                'max': Max[index1],
                'band1': band1[index1],
                'band2': band2[index1],
                'band3': band3[index1]
            }
        elif layerType[i] == 'digitalglobe':
            index2 += 1
            overlay = {
                'layerName': layerName[i],
                'type': layerType[i],
                'mapID': mapID[index2]
            }
        if overlay:
            overlays.append(overlay)
    # validation
    if not name or not radius:
        return 'KO', 400
    # update the project
    mongo.db.projects.update({'id': id}, {
        '$set': {
            'name': name,
            'type': 'CEP',
            'radius': radius,
            'overlays': overlays,
            'update_datetime': datetime.datetime.utcnow()
        }
    }, upsert=False)
    return 'OK', 200

@app.route('/api/project', methods=['DELETE'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def projectRemove():
    id = request.json.get('project_id')
    project = mongo.db.projects.find_one({'id': id}, {'_id': False})
    if not project:
        return 'Error!', 500
    if project['username'] != session.get('username'):
        return 'Forbidden!', 403
    filename = project['filename']
    mongo.db.projects.delete_many({'id': id})
    if os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], filename)):
        os.remove(os.path.join(app.config['UPLOAD_FOLDER'], filename))
    name, ext = os.path.splitext(filename)
    if os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], name)):
        shutil.rmtree(os.path.join(app.config['UPLOAD_FOLDER'], name))
    return 'OK', 200

@app.route("/api/project/<id>/export", methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def projectExportCSV(id=None):
    #
    project = mongo.db.projects.find_one({'id': id}, {'_id': False})
    username = project['username']
    records = mongo.db.records.find({'project_id': id, 'username': username}, {'_id': False})
    filename = project['filename'] + '.csv'
    #
    codeListNames = []
    for codeList in project['codeLists']:
        codeListNames.append(codeList['name'])
    #
    csvHeaderData = ['YCoordinate', 'XCoordinate'] + codeListNames
    csvString = listToCSVRowString(csvHeaderData)
    #
    for record in records:
        csvRowData = []
        csvRowData.append(record.get('plot').get('YCoordinate'))
        csvRowData.append(record.get('plot').get('XCoordinate'))
        values = json.loads(record['value'])
        for codeListName in codeListNames:
            value = values.get(codeListName, '')
            csvRowData.append(value)
        csvString += listToCSVRowString(csvRowData)
    #
    return Response(csvString, mimetype="text/csv", headers={"Content-disposition": "attachment; filename=" + filename})
