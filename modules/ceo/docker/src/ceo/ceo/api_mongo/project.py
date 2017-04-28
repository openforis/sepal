import os, shutil, logging, json, datetime, hashlib, csv, io, time
import xml.etree.ElementTree as ET

from flask import Response, session, request, redirect, url_for, jsonify, render_template, send_file
from flask_cors import CORS, cross_origin

from .. import app
from .. import mongo

from ..common.utils import import_sepal_auth, requires_auth

from werkzeug.utils import secure_filename

import zipfile

logger = logging.getLogger(__name__)

@app.route('/api/project/<id>', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def projectById(id=None):
    project = mongo.db.projects.find_one({'id': id}, {'_id': False});
    return jsonify(project), 200

@app.route('/api/project', methods=['GET'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
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
def projectFileByIdAndFilename(id=None, filename=None):
    project = mongo.db.projects.find_one({'id': id}, {'_id': False});
    name, ext = os.path.splitext(project['filename'])
    return send_file(os.path.join(app.config['UPLOAD_FOLDER'], name, filename), mimetype='text/xml', attachment_filename=filename, as_attachment=True)

@app.route('/api/project/add', methods=['POST'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
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
        #
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
                for item in items:
                    codeList.get('items').append({
                        'code': item.find('of:code', ns).text,
                        'label': item.find('of:label', ns).text
                    })
                codeLists.append(codeList)
            print (codeLists)
        #
        plots = []
        if os.path.isfile(os.path.join(extractDir, 'test_plots.ced')):
            with open(os.path.join(extractDir, 'test_plots.ced'), 'rb') as csvfile:
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
        data = request.form.to_dict()
        radius = data.get('radius')
        name = data.get('name')
        type = 'cep' #TODO
        overlays = []
        #gee-gateway
        collectionName = request.form.getlist('collectionName[]')
        dateFrom = request.form.getlist('dateFrom[]')
        dateTo = request.form.getlist('dateTo[]')
        Min = request.form.getlist('min[]')
        Max = request.form.getlist('max[]')
        band1 = request.form.getlist('band1[]')
        band2 = request.form.getlist('band2[]')
        band3 = request.form.getlist('band3[]')
        for i in range(0, len(collectionName)):
            overlay = {
                'type': 'gee-gateway',
                'collectionName': collectionName[i],
                'dateFrom': dateFrom[i],
                'dateTo': dateTo[i],
                'min': Min[i],
                'max': Max[i],
                'band1': band1[i],
                'band2': band2[i],
                'band3': band3[i]
            }
            overlays.append(overlay)
        #
        mongo.db.projects.insert({
            'id': generate_id(uniqueFilename),
            'name': name,
            'type': type,
            'filename': uniqueFilename,
            'username': username,
            'radius': radius,
            'upload_datetime': datetime.datetime.utcnow(),
            'plots': plots,
            'codeLists': codeLists,
            'overlays': overlays
        });
    return redirect(app.config['CEO_URL'] + 'project-list')

@app.route('/api/project/<id>', methods=['PUT'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def projectModify(id=None):
    #
    data = request.form.to_dict()
    radius = data.get('radius')
    name = data.get('name')
    type = 'cep' #TODO
    overlays = []
    #gee-gateway
    collectionName = request.form.getlist('collectionName[]')
    dateFrom = request.form.getlist('dateFrom[]')
    dateTo = request.form.getlist('dateTo[]')
    Min = request.form.getlist('min[]')
    Max = request.form.getlist('max[]')
    band1 = request.form.getlist('band1[]')
    band2 = request.form.getlist('band2[]')
    band3 = request.form.getlist('band3[]')
    for i in range(0, len(collectionName)):
        overlay = {
            'type': 'gee-gateway',
            'collectionName': collectionName[i],
            'dateFrom': dateFrom[i],
            'dateTo': dateTo[i],
            'min': Min[i],
            'max': Max[i],
            'band1': band1[i],
            'band2': band2[i],
            'band3': band3[i]
        }
        overlays.append(overlay)
    #
    mongo.db.projects.update({'id': id}, {
        '$set': {
            'name': name,
            'type': type,
            'radius': radius,
            'overlays': overlays,
            'update_datetime': datetime.datetime.utcnow()
        }
    }, upsert=False)
    return 'OK', 200

@app.route('/api/project/remove', methods=['DELETE'])
@cross_origin(origins=app.config['CO_ORIGINS'])
@import_sepal_auth
@requires_auth
def projectRemove():
    id = request.json.get('project_id')
    project = mongo.db.projects.find_one({'id': id}, {'_id': False});
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
    project = mongo.db.projects.find_one({'id': id}, {'_id': False});
    username = project['username']
    records = mongo.db.records.find({'project_id': id, 'username': username}, {'_id': False});
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
        print csvRowData
        csvString += listToCSVRowString(csvRowData)
    #
    return Response(csvString, mimetype="text/csv", headers={"Content-disposition": "attachment; filename=" + filename})

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def generate_id(value):
    hash_object = hashlib.md5(value)
    return hash_object.hexdigest()

def listToCSVRowString(lst):
    output = io.BytesIO()
    writer = csv.writer(output)
    print 1
    print lst
    writer.writerow(lst)
    return output.getvalue()
