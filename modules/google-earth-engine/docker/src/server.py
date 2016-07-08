import json
import re

import ee
import sys
from datetime import date
from dateutil.parser import parse
from flask import Flask
from flask import Response
from flask import render_template
from flask import request
from oauth2client.service_account import ServiceAccountCredentials

import landsat

app = Flask(__name__)


@app.route('/')
def index():
    countries = ee.FeatureCollection('ft:15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F')
    countryNames = countries.sort('NAME_ENGLI').aggregate_array('NAME_ENGLI').getInfo()
    return render_template('index.html', countryNames=countryNames)


@app.route('/preview')
def preview():
    aoi = _countryGeometry(request.args.get('country'))
    from_date = date.fromtimestamp(int(request.args.get('fromDate')) / 1000.0).isoformat() + 'T00:00'
    to_date = date.fromtimestamp(int(request.args.get('toDate')) / 1000.0).isoformat() + 'T00:00'
    sensors = request.args.get('sensors').split(',')
    bands = request.args.get('bands')
    mosaic = landsat.create_mosaic(
        aoi=aoi,
        sensors=sensors,
        from_date=from_date,
        to_date=to_date,
        target_day_of_year=int(request.args.get('targetDayOfYear')),
        from_day_of_year=int(request.args.get('fromDayOfYear')),
        to_day_of_year=int(request.args.get('toDayOfYear')),
        bands=bands.split(', ')
    )

    mapid = mosaic.getMapId({
        'bands': bands,
        'min': 100,
        'max': 5000,
        'gamma': 1.2
    })
    bounds = aoi.geometry().bounds().getInfo()['coordinates'][0][1:]
    return json.dumps({
        'mapId': mapid['mapid'],
        'token': mapid['token'],
        'bounds': bounds
    })


@app.route('/preview-scenes')
def previewScenes():
    aoi = _countryGeometry(request.args.get('country'))
    scenes = request.args.get('scenes').split(',')
    bands = request.args.get('bands')
    mosaic = landsat.create_mosaic_from_scenes(
        aoi=aoi,
        sceneIds=scenes,
        target_day_of_year=int(request.args.get('targetDayOfYear')),
        bands=bands.split(', ')
    )

    mapid = mosaic.getMapId({
        'bands': bands,
        'min': 100,
        'max': 5000,
        'gamma': 1.2
    })
    bounds = aoi.geometry().bounds().getInfo()['coordinates'][0][1:]
    return json.dumps({
        'mapId': mapid['mapid'],
        'token': mapid['token'],
        'bounds': bounds
    })


@app.route('/scenes-in-mosaic')
def scenes_in_mosaic():

    aoi = _countryGeometry(request.args.get('country'))
    from_date = date.fromtimestamp(int(request.args.get('fromDate')) / 1000.0).isoformat() + 'T00:00'
    to_date = date.fromtimestamp(int(request.args.get('toDate')) / 1000.0).isoformat() + 'T00:00'
    sensors = request.args.get('sensors').split(',')
    scenesInMosaic = landsat.get_scenes_in_mosaic(
        aoi=aoi,
        sensors=sensors,
        from_date=from_date,
        to_date=to_date,
        target_day_of_year=int(request.args.get('targetDayOfYear')),
        from_day_of_year=int(request.args.get('fromDayOfYear')),
        to_day_of_year=int(request.args.get('toDayOfYear'))
    )
    return json.dumps(scenesInMosaic)



@app.route('/sceneareas')
def sceneareas():
    countryIso = request.args.get('aoiId')
    countries = ee.FeatureCollection('ft:15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F')
    aoi = countries \
        .filterMetadata('ISO', 'equals', countryIso)

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
    targetDay = request.args.get('targetDay')
    startDate = request.args.get('startDate')
    endDate = request.args.get('endDate')

    m = re.search('(...)_(.*)', sceneAreaId)
    path = int(m.group(1))
    row = int(m.group(2))

    input = ee.ImageCollection('LC8_L1T_TOA') \
        .filter(ee.Filter.date(startDate, endDate)) \
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


def _countryGeometry(countryName):
    countries = ee.FeatureCollection('ft:15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F')
    aoi = countries \
        .filterMetadata('NAME_FAO', 'equals', countryName)
    return aoi


def _daysFromTarget(targetDay, date):
    theDate = parse(date)
    return min(map(lambda n: abs((theDate - parse(str(theDate.year + n) + '-' + targetDay)).days), [-1, 0, 1]))


def _toBrowseUrl(targetDay, date):
    theDate = parse(date)
    return min(map(lambda n: abs((theDate - parse(str(theDate.year + n) + '-' + targetDay)).days), [-1, 0, 1]))


if __name__ == '__main__':
    credentials = ServiceAccountCredentials.from_p12_keyfile(sys.argv[1], sys.argv[2], 'notasecret', ee.oauth.SCOPE)
    ee.Initialize(credentials)
    if len(sys.argv) > 3 and sys.argv[3] == 'debug':
        app.run(debug=True, threaded=True)
    else:
        app.run(host='0.0.0.0', threaded=True)
