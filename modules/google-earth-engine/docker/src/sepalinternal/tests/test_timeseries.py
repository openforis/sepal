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
from ..task.task import ThreadTask, ProcessTask,Task
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
    #
    #
    # class StatusMonitor(ThreadTask):
    #     def __init__(self, to_monitor):
    #         super(StatusMonitor, self).__init__()
    #         self.to_monitor = to_monitor
    #
    #     def run(self):
    #         previous_status = None
    #         i = 0
    #         while self.to_monitor.running() and self.running():
    #             i += 1
    #             # if i > 60:
    #             #     raise Exception('Test with a failure')
    #             status = self.to_monitor.status_message()
    #             if previous_status != status:
    #                 previous_status = status
    #                 print(status)
    #             time.sleep(0.1)
    #         self.resolve()
    #
    #     def close(self):
    #         self.to_monitor.cancel()

    class PrintingTask(ProcessTask):
        def __init__(self):
            super(PrintingTask, self).__init__()

        def run(self):
            raise AttributeError('A raised error')
            # for i in range(0, 5):
            #     print('Running')
            #     time.sleep(1)
            # self.cancel()
            # self.resolve()

        def close(self):
            print('closing printing task')

    printing_task = PrintingTask()

    Task.submit_all([printing_task]).catch(re_raise).get()
