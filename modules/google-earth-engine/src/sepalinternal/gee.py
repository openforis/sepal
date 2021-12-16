import json
from threading import Semaphore

import ee
from flask import request
from google.auth import crypt
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials

service_account_credentials = None
import logging

export_semaphore = Semaphore(5)
get_info_semaphore = Semaphore(2)


def init_service_account_credentials(args):
    global service_account_credentials

    with open(args['gee_key_path'], 'r') as file_:
        key_data = file_.read()
    signer = crypt.RSASigner.from_string(key_data)
    service_account_credentials = service_account.Credentials(
        signer=signer,
        service_account_email=args['gee_email'],
        token_uri=ee.oauth.TOKEN_URI,
        scopes=ee.oauth.SCOPES + ['https://www.googleapis.com/auth/drive']
    )


def init_ee():
    credentials = service_account_credentials
    if 'sepal-user' in request.headers:
        user = json.loads(request.headers['sepal-user'])
        googleTokens = user.get('googleTokens', None)
        if googleTokens:
            credentials = Credentials(googleTokens['accessToken'])
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


def get_info(ee_object):
    try:
        get_info_semaphore.acquire()
        return ee_object.getInfo()
    finally:
        get_info_semaphore.release()
