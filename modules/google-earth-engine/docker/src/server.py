import json
import re

import ee
import sys
from datetime import date
from datetime import datetime
from dateutil.parser import parse
from flask import Flask
from flask import Response
from flask import render_template
from flask import request
from oauth2client.service_account import ServiceAccountCredentials

import landsat

app = Flask(__name__)

_epoch = datetime.utcfromtimestamp(0)
_milis_per_day = 1000 * 60 * 60 * 24

viz_by_bands = {
    'B3, B2, B1': lambda params: {'bands': 'B3, B2, B1', 'min': 100, 'max': 5000, 'gamma': 1.8},
    'B4, B3, B2': lambda params: {'bands': 'B4, B3, B2', 'min': 100, 'max': 5000, 'gamma': 1.2},
    'B4, B5, B3': lambda params: {'bands': 'B4, B5, B3', 'min': 100, 'max': 5000, 'gamma': 1.2},
    'B7, B4, B3': lambda params: {'bands': 'B7, B4, B3', 'min': 100, 'max': 5000, 'gamma': 1.2},
    'B7, B5, B3': lambda params: {'bands': 'B7, B5, B3', 'min': 100, 'max': 5000, 'gamma': 1.2},
    'B7, B4, B2': lambda params: {'bands': 'B7, B4, B2', 'min': 100, 'max': 5000, 'gamma': 1.2},
    'ndvi': lambda params: {'bands': 'ndvi', 'min': -1, 'max': 1, 'palette': '0000FF, 00FF00'},
    'temp': lambda params: {'bands': 'temp', 'min': 200, 'max': 400, 'palette': '0000FF, FF0000'},
    'date': lambda params: {
        'bands': 'date',
        'min': params['from_days_since_epoch'],
        'max': params['to_days_since_epoch'],
        'palette': '00FFFF, 000099'
    },
    'days': lambda params: {
        'bands': 'days',
        'min': 0,
        'max': 183,
        'palette': '00FF00, FF0000'
    },
}


@app.route('/')
def index():
    countries = ee.FeatureCollection('ft:15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F') \
        .filterMetadata('NAME_FAO', 'not_equals', '')
    isos = countries.sort('NAME_FAO').aggregate_array('ISO').getInfo()
    names = countries.sort('NAME_FAO').aggregate_array('NAME_FAO').getInfo()
    countries = zip(isos, names)
    return render_template('index.html', countries=countries)


@app.route('/preview', methods=['GET', 'POST'])
def preview():
    aoi = _aoiGeometry()
    from_millis_since_epoch = int(request.values.get('fromDate'))
    to_millis_since_epoch = int(request.values.get('toDate'))
    from_date = date.fromtimestamp(from_millis_since_epoch / 1000.0).isoformat() + 'T00:00'
    to_date = date.fromtimestamp(to_millis_since_epoch / 1000.0).isoformat() + 'T00:00'
    sensors = _split(request.values.get('sensors'))
    bands = _split(request.values.get('bands'))
    mosaic = landsat.create_mosaic(
        aoi=aoi,
        sensors=sensors,
        from_date=from_date,
        to_date=to_date,
        target_day_of_year=int(request.values.get('targetDayOfYear')),
        target_day_of_year_weight=float(request.values.get('targetDayOfYearWeight')),
        bands=bands
    )
    viz_params = viz_by_bands[', '.join(bands)]({
        'from_days_since_epoch': from_millis_since_epoch / _milis_per_day,
        'to_days_since_epoch': to_millis_since_epoch / _milis_per_day
    })
    mapid = mosaic.getMapId(viz_params)
    return json.dumps({
        'mapId': mapid['mapid'],
        'token': mapid['token']
    })


@app.route('/preview-scenes', methods=['GET', 'POST'])
def previewScenes():
    aoi = _aoiGeometry()
    scenes = _split(request.values.get('sceneIds'))
    bands = _split(request.values.get('bands'))
    mosaic = landsat.create_mosaic_from_scene_ids(
        aoi=aoi,
        sceneIds=scenes,
        target_day_of_year=int(request.values.get('targetDayOfYear')),
        target_day_of_year_weight=float(request.values.get('targetDayOfYearWeight')),
        bands=bands
    )

    acquisition_timestamps = [_acquisition_timestamp(scene) for scene in scenes]
    from_millis_since_epoch = int(min(acquisition_timestamps))
    to_millis_since_epoch = int(max(acquisition_timestamps))
    mapid = mosaic.getMapId(viz_by_bands[', '.join(bands)]({
        'from_days_since_epoch': from_millis_since_epoch / _milis_per_day,
        'to_days_since_epoch': to_millis_since_epoch / _milis_per_day
    }))
    return json.dumps({
        'mapId': mapid['mapid'],
        'token': mapid['token']
    })


@app.route('/sceneareas')
def sceneareas():
    fusionTable = request.values.get('fusionTable')
    keyColumn = request.values.get('keyColumn')
    keyValue = request.values.get('keyValue')
    features = ee.FeatureCollection('ft:' + fusionTable)
    aoi = features \
        .filterMetadata(keyColumn, 'equals', keyValue)

    wrs = ee.FeatureCollection('ft:1EJjaOloQD5NL7ReC5aVtn8cX05xbdEbZthUiCFB6')  # WRS-2 polygons
    spatialFilter = ee.Filter.intersects(
        leftField='.geo',
        rightField='.geo',
        maxError=10
    )
    saveAllJoin = ee.Join.saveAll(matchesKey='scenes')
    intersectJoined = saveAllJoin.apply(aoi, wrs, spatialFilter)
    intersected = intersectJoined.aggregate_array('scenes').getInfo()
    sceneAreas = []
    for featureScenes in intersected:
        for sceneArea in featureScenes:
            polygon = map(lambda lnglat: list(reversed(lnglat)), sceneArea['geometry']['coordinates'][0])
            sceneAreas.append({
                'sceneAreaId': sceneArea['properties']['name'],
                'polygon': polygon,
            })

    # TODO: Remove duplicates - multiple features can have the same scene-area (e.g. China)
    return Response(json.dumps(sceneAreas), mimetype='application/json')


@app.route('/sceneareas/<sceneAreaId>')
def scenearea(sceneAreaId):
    targetDay = request.values.get('targetDay')
    fromDate = request.values.get('fromDate')
    toDate = request.values.get('toDate')

    m = re.search('(...)_(.*)', sceneAreaId)
    path = int(m.group(1))
    row = int(m.group(2))

    input = ee.ImageCollection('LC8_L1T_TOA') \
        .filter(ee.Filter.date(fromDate, toDate)) \
        .filterMetadata('WRS_PATH', 'equals', path) \
        .filterMetadata('WRS_ROW', 'equals', row)

    sceneIds = input.aggregate_array('LANDSAT_SCENE_ID').getInfo()
    cloudCovers = input.aggregate_array('CLOUD_COVER').getInfo()
    acquisitionDates = input.aggregate_array('DATE_ACQUIRED').getInfo()
    sunAzimuths = input.aggregate_array('SUN_AZIMUTH').getInfo()
    sunElevations = input.aggregate_array('SUN_ELEVATION').getInfo()
    daysFromTarget = map(lambda acquisitionDate: _daysFromTarget(targetDay, acquisitionDate), acquisitionDates)
    scores = map(
        lambda vals: vals[0] / (365. / 2.) + vals[1] / 10.,
        zip(daysFromTarget, cloudCovers)
    )
    browseUrls = map(
        lambda vals: 'http://earthexplorer.usgs.gov/browse/landsat_8/' + str(parse(vals[1]).year) + '/' +
                     str(path).zfill(3) + '/' + str(row).zfill(3) + '/' + vals[0] + '.jpg',
        zip(sceneIds, acquisitionDates)
    )
    sensors = ['LC8'] * len(sceneIds)

    scenes = sorted(
        map(
            lambda vals: dict(
                zip(['sceneId', 'cloudCover', 'acquisitionDate', 'sunAzimuth', 'sunElevation', 'daysFromTarget',
                     'score', 'browseUrl', 'sensor'], vals)
            ),
            zip(sceneIds, cloudCovers, acquisitionDates, sunAzimuths, sunElevations, daysFromTarget, scores, browseUrls,
                sensors)
        ),
        key=lambda k: k['score']
    )
    return json.dumps(scenes)


def _aoiGeometry():
    if 'polygon' in request.values:
        return _polygon_geometry()
    else:
        return _fusion_table_geometry()


def _polygon_geometry():
    polygon = json.loads(request.values.get('polygon'))
    return ee.Geometry.Polygon([polygon])


def _fusion_table_geometry():
    fusionTable = request.values.get('fusionTable')
    keyColumn = request.values.get('keyColumn')
    keyValue = request.values.get('keyValue')
    countries = ee.FeatureCollection('ft:' + fusionTable)
    aoi = countries \
        .filterMetadata(keyColumn, 'equals', keyValue)
    return aoi


def _daysFromTarget(targetDay, date):
    theDate = parse(date)
    return min(map(lambda n: abs((theDate - parse(str(theDate.year + n) + '-' + targetDay)).days), [-1, 0, 1]))


def _toBrowseUrl(targetDay, date):
    theDate = parse(date)
    return min(map(lambda n: abs((theDate - parse(str(theDate.year + n) + '-' + targetDay)).days), [-1, 0, 1]))


def _acquisition_timestamp(scene):
    date = datetime.strptime(scene[9:16], '%Y%j')
    return (date - _epoch).total_seconds() * 1000


def _split(str):
    return [s.strip() for s in str.split(',')]


if __name__ == '__main__':
    credentials = ServiceAccountCredentials.from_p12_keyfile(sys.argv[1], sys.argv[2], 'notasecret', ee.oauth.SCOPE)
    ee.Initialize(credentials)
    if len(sys.argv) > 3 and sys.argv[3] == 'debug':
        app.run(debug=True, threaded=True)
    else:
        app.run(host='0.0.0.0', threaded=True)
