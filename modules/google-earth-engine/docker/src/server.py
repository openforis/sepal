import json
import sys
from datetime import date

import ee
from ee.oauthinfo import OAuthInfo
from flask import Flask
from flask import render_template
from flask import request
from oauth2client.service_account import ServiceAccountCredentials

import landsat8

app = Flask(__name__)


@app.route('/')
def index():
    countries = ee.FeatureCollection('ft:1tdSwUL7MVpOauSgRzqVTOwdfy17KDbw-1d9omPw')
    countryNames = countries.aggregate_array('Country').getInfo()
    return render_template('index.html', countryNames=countryNames)


@app.route('/map')
def map():
    country = request.args.get('country')
    bands = request.args.get('bands')
    countries = ee.FeatureCollection('ft:1tdSwUL7MVpOauSgRzqVTOwdfy17KDbw-1d9omPw')
    aoi = countries \
        .filterMetadata('Country', 'equals', country)

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



if __name__ == '__main__':
    # credentials = ServiceAccountCredentials.from_json_keyfile_name(sys.argv[1], OAuthInfo.SCOPE)
    credentials = ServiceAccountCredentials.from_p12_keyfile(sys.argv[1], sys.argv[2], 'notasecret', OAuthInfo.SCOPE)
    ee.Initialize(credentials)
    if len(sys.argv) > 3 and sys.argv[3] == 'debug':
        app.run(debug=True)
    else:
        app.run()
