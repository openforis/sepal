import logging
from threading import Thread

import httplib2
from apiclient import discovery
from apiclient.http import MediaIoBaseDownload

logger = logging.getLogger(__name__)


class DriveDownload(object):
    def __init__(self, credentials, path, download_dir, listener):
        self.credentials = credentials
        self.path = path
        self.download_dir = download_dir
        self.listener = listener
        self.drive = discovery.build('drive', 'v3', http=(credentials.authorize(httplib2.Http())))
        self.running = True
        self.canceled = False
        self.thread = Thread(
            name='Drive_download-' + path,
            target=self._start_download)
        self.thread.start()

    def cancel(self):
        logging.debug('Cancelling Google Drive download and removing file: ' + self.path)
        self.canceled = True
        self.stop()

    def stop(self):
        if self.running:
            logging.debug('Stopping download from Google Drive of ' + self.path)
            self.running = False

    def _start_download(self):
        logging.debug('Starting download from Google Drive: ' + self.path)
        file_id = self.to_file_id()
        if not file_id:
            self.listener.update_status({
                'state': 'FAILED',
                'description': '"' + self.path + '" not found on Google Drive'})
            self.stop()
            return
        try:
            request = self.drive.files().get_media(fileId=file_id)
            downloaded_file = open(self.download_dir + '/' + self.path, 'w')
            downloader = MediaIoBaseDownload(downloaded_file, request)
            done = False
            while self.running and not done:
                status, done = downloader.next_chunk()
                if not self.canceled:
                    self.listener.update_status({
                        'state': 'ACTIVE',
                        'description': "Downloaded %d%%." % int(status.progress() * 100)})
            if done:
                self.listener.update_status({
                    'state': 'COMPLETED',
                    'description': "Completed"})
            if self.canceled:
                self.listener.update_status({
                    'state': 'CANCELED',
                    'description': "Canceled"})
            if done or self.canceled:
                self._delete(file_id)
        except Exception:
            logger.exception('Download from Google Drive failed. Path: ' + self.path)
            self.listener.update_status({
                'state': 'FAILED',
                'description': 'Download from Google Drive failed'})
            self.stop()

    def to_file_id(self):
        results = self.drive.files().list(q='name = \'' + self.path + '\'', fields="files(id)").execute()
        drive_files = results.get('files', [])
        if not drive_files:
            return None
        drive_file = drive_files[0]
        file_id = drive_file['id']
        return file_id

    def _delete(self, file_id):
        self.drive.files().delete(fileId=file_id).execute()
