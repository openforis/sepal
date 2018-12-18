import json

import ee
from flask import request
from oauth2client.client import OAuth2Credentials
from oauth2client.service_account import ServiceAccountCredentials

service_account_credentials = None
import logging


def init_service_account_credentials(args):
    global service_account_credentials
    service_account_credentials = ServiceAccountCredentials.from_p12_keyfile(
        service_account_email=args['gee_email'],
        filename=args['gee_key_path'],
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


def to_asset_id(asset_path):
    asset_roots = ee.data.getAssetRoots()
    if not asset_roots:
        raise Exception('User has no GEE asset roots')
    return asset_roots[0]['id'] + '/' + asset_path


def delete_asset_collection(asset_id):
    logging.info('Recursively deleting ' + asset_id)
    if ee.data.getInfo(asset_id):
        images = ee.data.getList({
            'id': asset_id,
            'fields': 'id'
        })
        for image in images:
            ee.data.deleteAsset(image['id'])
            logging.info('Deleted ' + image['id'])
        ee.data.deleteAsset(asset_id)
        logging.info('Deleted ' + asset_id)


def create_asset_image_collection(asset_id):
    delete_asset_collection(asset_id)
    ee.data.create_assets(
        asset_ids=[asset_id],
        asset_type=ee.data.ASSET_TYPE_IMAGE_COLL,
        mk_parents=True
    )


def create_asset_folder(asset_id):
    ee.data.create_assets(
        asset_ids=[asset_id],
        asset_type=ee.data.ASSET_TYPE_FOLDER,
        mk_parents=True
    )
