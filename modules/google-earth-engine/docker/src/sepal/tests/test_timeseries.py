from __future__ import print_function
from __future__ import print_function

import logging
import os

import ee
import time
from oauth2client import client
from oauth2client import tools
from oauth2client.file import Storage

from ..task import Task
from ..timeseries import DownloadFeatures

flags = None
logger = logging.getLogger(__name__)

SCOPES = ee.oauth.SCOPE + ' https://www.googleapis.com/auth/drive'
CLIENT_SECRET_FILE = 'client_secret.json'
APPLICATION_NAME = 'Drive API Python Quickstart'


def get_credentials():
    home_dir = os.path.expanduser('~')
    credential_dir = os.path.join(home_dir, '.credentials')
    if not os.path.exists(credential_dir):
        os.makedirs(credential_dir)
    credential_path = os.path.join(credential_dir,
                                   'drive-python-quickstart.json')

    store = Storage(credential_path)
    credentials = store.get()
    if not credentials or credentials.invalid:
        flow = client.flow_from_clientsecrets(home_dir + '/' + CLIENT_SECRET_FILE, SCOPES)
        flow.user_agent = APPLICATION_NAME
        credentials = tools.run_flow(flow, store, flags)
        print('Storing credentials to ' + credential_path)
    return credentials


credentials = get_credentials()


# http = credentials.authorize(httplib2.Http())
# service = discovery.build('drive', 'v3', http=http)
#
# results = service.files().list(
#     pageSize=10,fields="nextPageToken, files(id, name)").execute()
# items = results.get('files', [])
# if not items:
#     print('No files found.')
# else:
#     print('Files:')
#     for item in items:
#         print('{0} ({1})'.format(item['name'], item['id']))


def re_raise(e):
    e.re_raise()


def test_timeseries():
    ee.InitializeThread(credentials)

    download_features = DownloadFeatures(
        download_dir='/Users/wiell/Downloads',
        description='test_timeseries',
        credentials=credentials,
        expression='10000 * (1 + (i.nir - i.red) / (i.nir + i.red))',
        data_sets=['landsat8', 'landsat7', 'sentinel2'],
        aoi=ee.Geometry(
            {"type": "Polygon", "coordinates": [
                [[12.474353314755717, 41.87795699850863], [12.474353314755717, 41.873139840393165],
                 [12.485682965634624, 41.873083917686145], [12.485618592618266, 41.87776527776029]]], "evenOdd": True}
        ),
        from_date='2010-01-01',
        to_date='2017-01-01',
        mask_snow=True,
        brdf_correct=False
    )

    class StatusMonitor(Task):
        def run(self):
            previous_status = None
            while download_features.running() and self.running():
                status = download_features.status()
                if previous_status != status:
                    previous_status = status
                    print(status)
                time.sleep(1)
            self.resolve()

    Task.submit_all([download_features, StatusMonitor()]).catch(re_raise).get()

    # download_features.submit().get()

#
# def first(resolve, reject):
#     print('Executing first')
#     resolve(1)
#
#
# def second(value):
#     print('Executing second')
#     return 1 + value
#
#
# def on_failure(exception):
#     print('Failed with {}'.format(exception))
#
#
# result = Promise(first)\
#     .then(second, on_failure)\
#     # .get()
# print('Result: {}'.format(result))
