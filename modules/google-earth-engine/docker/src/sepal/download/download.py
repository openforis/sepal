import logging

from drive import DriveDownload
from earthengine import EarthEngineStatus
from postprocess import PostProcess


logger = logging.getLogger(__name__)


class Downloader(object):
    def __init__(self, download_dir):
        self.download_dir = download_dir
        self.downloads = {}
        self.statuses = {}

    def start_download(self, task_id, name, file_id, bands, credentials):
        if task_id in self.downloads:
            logging.info('Trying to start downloading a pre-existing task:' + task_id)
            return
        logging.info('Downloading ' + task_id)
        self.statuses[task_id] = {'state': 'ACTIVE', 'description': 'Export to Google Drive pending...'}
        download = Download(
            task_id=task_id,
            file_name=name,
            file_id=file_id,
            bands=bands,
            credentials=credentials,
            download_dir=self.download_dir,
            listener=self)
        self.downloads[task_id] = download

    def status(self, task_id):
        status = self.statuses[task_id]
        logging.debug('Fetching status of ' + task_id + '(' + str(status) + ')')
        return status

    def update_status(self, task_id, status):
        current_state = self.statuses[task_id]['state']
        state = status['state']
        if current_state == 'ACTIVE':  # Only update state if current state is ACTIVE
            logging.info(
                'Updating status of ' + task_id + ' from ' + str(self.statuses[task_id]) + ' to ' + str(status))
            self.statuses[task_id] = status
        else:
            logging.debug(
                'Trying to update state of non-active task ' + task_id + ' from ' + str(
                    self.statuses[task_id]) + ' to ' + str(status))
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
    def __init__(self, task_id, file_name, file_id, credentials, bands, download_dir, listener):
        self.task_id = task_id
        self.file_id = file_id
        self.credentials = credentials
        self.dir = download_dir
        self.listener = listener
        self.earth_engine_status = EarthEngineStatus(
            task_id=task_id,
            credentials=credentials,
            listener=self
        )
        self.drive_download = DriveDownload(
            credentials=self.credentials,
            file_name=file_name,
            file_id=self.file_id,
            download_dir=self.dir,
            listener=self
        )
        self.post_process = PostProcess(
            file_name=file_name,
            download_dir=download_dir,
            bands=bands,
            listener=self
        )
        self.current_step = None

    def update_status(self, status):
        self.listener.update_status(self.task_id, status)
        step = status['step'] if 'step' in status else None
        step_taken = step and self.current_step != step
        self.current_step = step
        if step_taken:
            if step == 'EXPORTED':
                self.earth_engine_status.stop()
                self.drive_download.start()
            elif step == 'DOWNLOADED':
                self.drive_download.stop()
                self.post_process.start()
        if status['state'] != 'ACTIVE':
            self.stop()

    def cancel(self):
        if self.earth_engine_status:
            self.earth_engine_status.cancel()
        if self.drive_download:
            self.drive_download.cancel()
        if self.post_process:
            self.post_process.cancel()
        self.stop()

    def stop(self):
        logging.debug('Stopping download of task ' + self.task_id)
        if self.earth_engine_status:
            self.earth_engine_status.stop()
            self.earth_engine_status = None
        if self.drive_download:
            self.drive_download.stop()
            self.drive_download = None
        if self.post_process:
            self.post_process.stop()
            self.post_process = None
