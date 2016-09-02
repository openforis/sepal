import logging

from drive import DriveDownload
from earthengine import EarthEngineStatus

logger = logging.getLogger(__name__)


class Downloader(object):
    def __init__(self, credentials, download_dir):
        self.credentials = credentials
        self.download_dir = download_dir
        self.downloads = {}
        self.statuses = {}

    def start_download(self, task_id):
        if task_id in self.downloads:
            logging.info('Trying to start downloading a pre-existing task:' + task_id)
            return
        logging.info('Downloading ' + task_id)
        self.statuses[task_id] = {'state': 'ACTIVE', 'description': 'Export to Google Drive pending...'}
        download = Download(
            task_id=task_id,
            credentials=self.credentials,
            download_dir=self.download_dir,
            listener=self)
        self.downloads[task_id] = download

    def status(self, task_id):
        logging.info('Fetching status of ' + task_id)
        status = self.statuses[task_id]
        return status

    def update_status(self, task_id, status):
        current_state = self.statuses[task_id]['state']
        state = status['state']
        if current_state == 'ACTIVE':  # Only update state if current state is ACTIVE
            logging.info('Updating status of ' + task_id + ' from ' + current_state + ' to ' + state)
            self.statuses[task_id] = status
        else:
            logging.debug(
                'Trying to update state of non-active task ' + task_id + ' from ' + current_state + ' to ' + state)
        if state != 'ACTIVE':
            del self.downloads[task_id]

    def cancel(self, task_id):
        self.statuses[task_id] = {'state': 'CANCELED', 'description': 'Canceled'}
        if task_id in self.downloads:
            logging.info('Cancelling ' + task_id)
            self.downloads[task_id].cancel()
            del self.downloads[task_id]

    def stop(self):
        logging.info('Stopping Downloader')
        for download in self.downloads.values():
            download.stop()


class Download(object):
    def __init__(self, task_id, credentials, download_dir, listener):
        self.task_id = task_id
        self.credentials = credentials
        self.dir = download_dir
        self.listener = listener
        self.earth_engine_status = EarthEngineStatus(task_id=task_id, listener=self)
        self.drive_download = None
        self.current_step = None

    def update_status(self, status):
        step = status['step'] if 'step' in status else None
        completed_export = step and step == 'EXPORTED' and self.current_step != step
        self.current_step = step
        if completed_export:
            self.earth_engine_status.stop()
            self._begin_download(status['path'])
        self.listener.update_status(self.task_id, status)
        if status['state'] != 'ACTIVE':
            self.stop()

    def cancel(self):
        if self.earth_engine_status:
            self.earth_engine_status.cancel()
        if self.drive_download:
            self.drive_download.cancel()
        self.stop()

    def stop(self):
        logging.debug('Stopping download of task ' + self.task_id)
        if self.earth_engine_status:
            self.earth_engine_status.stop()
            self.earth_engine_status = None
        if self.drive_download:
            self.drive_download.stop()
            self.drive_download = None

    def _begin_download(self, path):
        self.drive_download = DriveDownload(
            credentials=self.credentials,
            path=path,
            download_dir=self.dir,
            listener=self)
