import argparse
import json

import ee
import sys
from flask import request
from oauth2client.client import OAuth2Credentials
from oauth2client.service_account import ServiceAccountCredentials

parser = argparse.ArgumentParser()
parser.add_argument('--gee-email', required=True, help='Earth Engine service account email')
parser.add_argument('--gee-key-path', required=True, help='Path to Earth Engine service account key')
args, unknown = parser.parse_known_args()

service_account_credentials = ServiceAccountCredentials.from_p12_keyfile(
    service_account_email=args.gee_email,
    filename=args.gee_key_path,
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
