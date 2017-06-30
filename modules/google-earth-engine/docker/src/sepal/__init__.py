import ee
import sys
from oauth2client.service_account import ServiceAccountCredentials
from oauth2client.client import OAuth2Credentials
from aoi import Aoi
from image_spec import ImageSpec
from mosaic_spec import MosaicSpec
import ee
import json
from flask import request

service_account_credentials = ServiceAccountCredentials.from_p12_keyfile(
    service_account_email=sys.argv[1],
    filename=sys.argv[2],
    private_key_password='notasecret',
    scopes=ee.oauth.SCOPE + ' https://www.googleapis.com/auth/drive ')


def init_ee():
    credentials = service_account_credentials
    if 'sepal-user' in request.headers:
        user = json.loads(request.headers['sepal-user'])
        googleTokens = user.get('googleTokens', None)
        if googleTokens:
            credentials = OAuth2Credentials(googleTokens['accessToken'], None, None, None, None, None, None)
    ee.InitializeThread(credentials)
