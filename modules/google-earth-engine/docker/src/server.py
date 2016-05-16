import json
import re
import sys
from datetime import date

import ee
from dateutil.parser import parse
from ee.oauthinfo import OAuthInfo
from flask import Flask
from flask import Response
from flask import render_template
from flask import request
from oauth2client.service_account import ServiceAccountCredentials

import landsat8

app = Flask(__name__)


@app.route('/')
def index():
    countries = ee.FeatureCollection('ft:16CTzhDWVwwqa0e5xe4dRxQ9yoyE1hVt_3ekDFQ')
    countryNames = countries.sort('admin').aggregate_array('admin').getInfo()
    return render_template('index.html', countryNames=countryNames)


@app.route('/map')
def createMap():
    country = request.args.get('country')
    bands = request.args.get('bands')
    countries = ee.FeatureCollection('ft:16CTzhDWVwwqa0e5xe4dRxQ9yoyE1hVt_3ekDFQ')
    aoi = countries \
        .filterMetadata('admin', 'equals', country)

    bounds = aoi.geometry().bounds().getInfo()['coordinates'][0][1:]
    mosaic = landsat8.mosaic(
        aoi,
        target_day_of_year=260,
        from_day_of_year=200,
        to_day_of_year=300,
        from_date='2013-02-11',
        to_date=date.today().isoformat(),
        max_cloud_cover=80,
        bands=bands.split(', ')
    )

    vizParams = {
        'bands': bands,
        'min': 100,
        'max': 5000,
        'gamma': 1.2
    }
    mapid = mosaic.getMapId(vizParams)

    return json.dumps({
        'mapId': mapid['mapid'],
        'token': mapid['token'],
        'bounds': bounds
    })


@app.route('/sceneareas')
def sceneareas():
    countryIso = request.args.get('aoiId')
    countries = ee.FeatureCollection('ft:16CTzhDWVwwqa0e5xe4dRxQ9yoyE1hVt_3ekDFQ')
    aoi = countries \
        .filterMetadata('sov_a3', 'equals', countryIso)

    wrs = ee.FeatureCollection('ft:1EJjaOloQD5NL7ReC5aVtn8cX05xbdEbZthUiCFB6')  # WRS-2 polygons
    spatialFilter = ee.Filter.intersects(
        leftField='.geo',
        rightField='.geo',
        maxError=10
    )
    saveAllJoin = ee.Join.saveAll(matchesKey='scenes')
    intersectJoined = saveAllJoin.apply(aoi, wrs, spatialFilter)
    # intersected = ee.FeatureCollection(ee.List(intersectJoined.first().get('scenes')))
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


def _daysFromTarget(targetDay, date):
    theDate = parse(date)
    return min(map(lambda n: abs((theDate - parse(str(theDate.year + n) + '-' + targetDay)).days), [-1, 0, 1]))


def _toBrowseUrl(targetDay, date):
    theDate = parse(date)
    return min(map(lambda n: abs((theDate - parse(str(theDate.year + n) + '-' + targetDay)).days), [-1, 0, 1]))


if __name__ == '__main__':
    # credentials = ee.ServiceAccountCredentials(sys.argv[1], sys.argv[2])
    credentials = ServiceAccountCredentials.from_p12_keyfile(sys.argv[1], sys.argv[2], 'notasecret', OAuthInfo.SCOPE)
    ee.Initialize(credentials)
    if len(sys.argv) > 3 and sys.argv[3] == 'debug':
        app.run(debug=True)
    else:
        app.run(host= '0.0.0.0')
