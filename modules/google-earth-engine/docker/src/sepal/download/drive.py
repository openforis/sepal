import logging
import os
from threading import Thread

import httplib2
from apiclient import discovery
from apiclient.http import MediaIoBaseDownload

logger = logging.getLogger(__name__)


class DriveDownload(object):
    def __init__(self, credentials, file_name, file_id, download_dir, listener):
        self.credentials = credentials
        self.file_name = file_name
        self.file_id = file_id
        self.dir = str(download_dir + '/' + self.file_name)
        self.listener = listener
        self.drive = discovery.build('drive', 'v3', http=(credentials.authorize(httplib2.Http())))
        self.running = True
        self.canceled = False
        self.thread = Thread(
            name='DriveDownload-' + file_name,
            target=self._start_download)

    def start(self):
        self.thread.start()

    def cancel(self):
        logging.debug('Cancelling Google Drive download and removing file: ' + self.file_name)
        self.canceled = True
        self.stop()

    def stop(self):
        if self.running:
            logging.debug('Stopping download from Google Drive of ' + self.file_name)
            self.running = False

    def _start_download(self):
        logging.debug('Starting download from Google Drive: ' + self.file_name)
        folder_id = self._drive_folder_id(self.file_id)
        drive_files = self._files_in_folder(folder_id)
        if not drive_files:
            self.listener.update_status({
                'state': 'FAILED',
                'description': '"' + self.file_name + '" not found on Google Drive'})
            self.stop()
            return

        if not os.path.exists(self.dir):
            os.makedirs(self.dir)

        completed = True
        for file_index, drive_file in enumerate(drive_files):
            if not self._download_file(drive_file, file_index, len(drive_files)):
                self._delete(folder_id)
                completed = False
                break

        if completed:
            self.listener.update_status({
                'state': 'ACTIVE',
                'step': "DOWNLOADED",
                'description': "Downloaded files"})

    def _download_file(self, drive_file, file_index, file_count):
        logging.debug('Downloading %s from Google Drive: ' % str(drive_file['name']))
        try:
            request = self.drive.files().get_media(fileId=drive_file['id'])
            downloaded_file = open(self.dir + '/' + drive_file['name'], 'w')
            downloader = MediaIoBaseDownload(downloaded_file, request)
            done = False
            while self.running and not done:
                status, done = downloader.next_chunk()
                if not self.canceled:
                    self.listener.update_status({
                        'state': 'ACTIVE',
                        'step': 'DOWNLOADING',
                        'description': "Downloaded %d%% of file %d of %d." % (
                            int(status.progress() * 100), file_index + 1, file_count)})
            if self.canceled:
                self.listener.update_status({
                    'state': 'CANCELED',
                    'description': "Canceled"})
                return False
            self._delete(drive_file['id'])
        except Exception:
            logger.exception('Download from Google Drive failed. Path: ' + self.file_name)
            self.listener.update_status({
                'state': 'FAILED',
                'description': 'Download from Google Drive failed'})
            self.stop()
            return False
        return True

    def _files_in_folder(self, folder_id):
        """Lists files in drive folder, returning dict with id and name"""
        if not folder_id:
            return []
        return self.drive.files().list(
            q="'%s' in parents" % folder_id,
            fields="files(id, name)"
        ).execute().get('files', [])

    def _drive_folder_id(self, folder_name):
        folders = self.drive.files().list(
            q="mimeType = 'application/vnd.google-apps.folder' and name = '" + folder_name + "'",
            fields="files(id)"
        ).execute().get('files', [])
        if len(folders) == 0:
            return None
        return folders[0]['id']

    def _delete(self, file_id):
        self.drive.files().delete(fileId=file_id).execute()
