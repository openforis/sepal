from __future__ import print_function
from __future__ import print_function

import logging
import os

import ee
import time
from oauth2client import client
from oauth2client import tools
from oauth2client.file import Storage

from ..image.asset_export import AssetExport
from ..image.sepal_export import SepalExport
from ..task.task import ThreadTask, Task
from ..timeseries.download import DownloadFeatures

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
    if type(e) == Task.Canceled:
        print('Task has been canceled')
    else:
        e.re_raise()


#
#
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

    class StatusMonitor(ThreadTask):
        def __init__(self, to_monitor):
            super(StatusMonitor, self).__init__()
            self.to_monitor = to_monitor

        def run(self):
            previous_status = None
            i = 0
            while self.to_monitor.running() and self.running():
                i += 1
                # if i > 60:
                #     raise Exception('Test with a failure')
                status = self.to_monitor.status_message()
                if previous_status != status:
                    previous_status = status
                    print(status)
                time.sleep(0.1)
            self.resolve()

        def close(self):
            self.to_monitor.cancel()

    # sepal_export = SepalExport(
    #     description='test_export',
    #     credentials=credentials,
    #     download_dir='/Users/wiell/Downloads',
    #     spec={
    #         'imageType': 'MOSAIC',
    #         'type': 'automatic',
    #         'sensors': ['LANDSAT_8'],
    #         'fromDate': '2016-01-01',
    #         'toDate': '2017-01-01',
    #         'aoi': {
    #             'type': 'polygon',
    #             'path': [
    #                 [12.474353314755717, 41.87795699850863], [12.474353314755717, 41.873139840393165],
    #                 [12.485682965634624, 41.873083917686145], [12.485618592618266, 41.87776527776029]],
    #         }
    #     }
    # )

    # asset_export = AssetExport(
    #     description='test_export',
    #     credentials=credentials,
    #     image_spec={
    #         'imageType': 'MOSAIC',
    #         'type': 'automatic',
    #         'sensors': ['LANDSAT_8'],
    #         'fromDate': '2016-01-01',
    #         'toDate': '2017-01-01',
    #         'aoi': {
    #             'type': 'polygon',
    #             'path': [
    #                 [12.474353314755717, 41.87795699850863], [12.474353314755717, 41.873139840393165],
    #                 [12.485682965634624, 41.873083917686145], [12.485618592618266, 41.87776527776029]],
    #         }
    #     })

    # Task.submit_all([download_features, StatusMonitor(download_features)]).catch(re_raise).get()
    # Task.submit_all([sepal_export, StatusMonitor(sepal_export)]).catch(re_raise).get()
    # Task.submit_all([asset_export, StatusMonitor(asset_export)]).catch(re_raise).get()

    # download_features.submit().get()

    # printing_task = PrintingTask()
    # Task.submit_all([printing_task, CancelingTask(printing_task)]).catch(re_raise).get()
    # printing_task.submit().catch(re_raise).get()

    # class PrintingTask(ProcessTask):
    #     def __init__(self, name=None):
    #         super(PrintingTask, self).__init__(name)
    #
    #     def run(self):
    #         for i in range(0, 5):
    #             print('Running')
    #             time.sleep(1)
    #         self.resolve()
    #
    #     def close(self):
    #         print('closing printing task')
    #
    #
    # class CancelingTask(ThreadTask):
    #     def __init__(self, to_stop):
    #         super(CancelingTask, self).__init__()
    #         self.to_stop = to_stop
    #
    #     def run(self):
    #         print('Running stopping task')
    #         time.sleep(2)
    #         self.to_stop.cancel()
    #
    #         print('Stopping task')
    #         self.resolve()
