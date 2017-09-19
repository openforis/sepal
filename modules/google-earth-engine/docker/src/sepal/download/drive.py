import logging
import os
from threading import Thread

import httplib2
from apiclient import discovery
from apiclient.http import MediaIoBaseDownload
from datetime import datetime

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
            if not self._download_file(folder_id, drive_file, file_index, len(drive_files)):
                completed = False
                break

        self._delete(folder_id)
        if completed:
            self.listener.update_status({
                'state': 'ACTIVE',
                'step': "DOWNLOADED",
                'description': "Downloaded files"})

    def _download_file(self, folder_id, drive_file, file_index, file_count):
        logging.debug('Downloading %s from Google Drive: ' % str(drive_file['name']))

        max_retries = 10
        for retry in range(0, max_retries):
            try:
                request = self.drive.files().get_media(fileId=drive_file['id'])
                downloaded_file = open(self.dir + '/' + drive_file['name'], 'w')
                downloader = MediaIoBaseDownload(downloaded_file, request)

                modified_time = self._touch(folder_id)
                done = False
                while self.running and not done:
                    if self._seconds_since(modified_time) > 5 * 60:  # Heartbeat after 5 minutes download
                        modified_time = self._touch(folder_id)
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
                    return False  # Canceled
                self._delete(drive_file['id'])
                return True  # Succeeded
            except Exception:
                logger.exception(
                    'Download from Google Drive failed. file: ' + drive_file['name'] + ', retry: ' + str(retry)
                )

        logger.exception(
            'Giving up download from Google Drive after ' + str(max_retries) +
            ' retries. file: ' + drive_file['name']
        )
        self.listener.update_status({
            'state': 'FAILED',
            'description': 'Download from Google Drive failed'})
        self.stop()
        return False  # Failed

    def _touch(self, folder_id):
        now = datetime.utcnow()

        def update_file(id):
            self.drive.files().update(
                fileId=id,
                body={'modifiedTime': now.strftime("%Y-%m-%dT%H:%M:%S" + 'Z')}
            ).execute()

        update_file(folder_id)
        for file_in_folder in self._files_in_folder(folder_id):
            update_file(file_in_folder['id'])
        return now

    def _files_in_folder(self, folder_id):
        """Lists files in drive folder, returning dict with id and name"""
        files = []
        if not folder_id:
            return files

        def list_files(previousFiles=[], pageToken=None):
            result = self.drive.files().list(
                q="'%s' in parents" % folder_id,
                fields="nextPageToken, files(id, name)",
                pageSize=1000,
                pageToken=pageToken
            ).execute()
            previousFiles += result.get('files', [])
            nextPageToken = result.get('nextPageToken', None)
            if nextPageToken:
                previousFiles += list_files(previousFiles, nextPageToken)
            return previousFiles

        fileList = list_files()
        return fileList

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

    def _seconds_since(self, time):
        return (datetime.utcnow() - time).total_seconds()
