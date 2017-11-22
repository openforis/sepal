import fnmatch
import logging
import os
from collections import namedtuple

import httplib2
import time
from apiclient import discovery
from apiclient.http import MediaIoBaseDownload
from datetime import datetime
from dateutil.parser import parse

from ..exception import re_raisable
from ..task.task import ThreadTask

logger = logging.getLogger(__name__)


def create_folder(credentials, name):
    drive = _create_drive(credentials)
    return drive.files().create(
        body={'name': name, 'mimeType': 'application/vnd.google-apps.folder'},
        fields='id'
    ).execute()


def delete(credentials, item):
    try:
        drive = _create_drive(credentials)
        logger.debug('Deleting {0}'.format(item))
        drive.files().delete(fileId=item['id']).execute()
    except Exception:
        pass # Ignore failure to delete file


def _create_drive(credentials):
    return discovery.build('drive', 'v3', http=(credentials.authorize(httplib2.Http())))


class Download(ThreadTask):
    Status = namedtuple('DownloadStatus', 'state, total_files, total_bytes, downloaded_files, downloaded_bytes')
    DownloadSpec = namedtuple('DownloadSpec', 'credentials, drive_path, destination_path, matching, move, touch')

    def __init__(self, credentials, drive_path, destination_path, matching=None, move=False, touch=False):
        self.spec = self.DownloadSpec(credentials, drive_path, destination_path, matching, move, touch)
        super(Download, self).__init__()
        self.drive = _create_drive(self.spec.credentials)
        self._status = self.Status(
            state=self.state,
            total_files=None,
            total_bytes=None,
            downloaded_files=0,
            downloaded_bytes=0
        )

    def run(self):
        root_item = self._drive_item(self.spec.drive_path)
        items = self._list_items(root_item)
        files = [item for item in items if item['mimeType'] != 'application/vnd.google-apps.folder']

        if not files:
            raise Exception('No files found to download. path: {0}, matching: {1}'
                            .format(self.spec.drive_path, self.spec.matching))

        if not os.path.exists(self.spec.destination_path):
            os.makedirs(self.spec.destination_path)

        self._update_status(
            state=self.state,
            total_files=len(files),
            total_bytes=sum([int(file['size']) for file in files])
        )

        items_left = list(items)
        for drive_file in files:
            items_left.remove(drive_file)
            self._download_file(drive_file, items_left)
            if not self.running():
                return
            if self.spec.move:
                self._delete(drive_file)
            time.sleep(1)

        if self.spec.move and not self.spec.matching:
            self._delete(root_item)

        self.resolve()

    def _download_file(self, drive_file, items_left):
        destination_path = self._create_destination_path(drive_file)
        downloaded_bytes_without_file = self.status().downloaded_bytes
        downloaded_files_without_file = self.status().downloaded_files
        file_size = int(drive_file['size'])
        last_exception = None
        max_retries = 10
        for retry in range(0, max_retries):
            if not self.running():
                return
            logger.debug('Downloading {0} to {1}. retry={2}'.format(drive_file, destination_path, retry))
            try:
                with open(destination_path, 'w') as destination_file:
                    request = self.drive.files().get_media(fileId=drive_file['id'])
                    downloader = MediaIoBaseDownload(destination_file, request)
                    while self.running():
                        self._touch(items_left)
                        status, done = downloader.next_chunk()
                        self._update_status(
                            downloaded_bytes=int(downloaded_bytes_without_file + file_size * status.progress())
                        )
                        if done:
                            self._update_status(
                                downloaded_files=downloaded_files_without_file + 1
                            )

                            destination_file.flush()
                            return
            except Exception:
                last_exception = re_raisable()
                logger.warn('Failed to download {0} to {1}. retry={2}, error={3}'
                            .format(drive_file, destination_path, retry, last_exception.message))

        last_exception.re_raise()

    def status(self):
        return self._update_status(state=self.state)

    def close(self):
        logging.debug('closing {0}, {1}'.format(self.spec.drive_path, self.spec.matching))

    def _create_destination_path(self, drive_file):
        parent_path_parts = drive_file['parent_path'].split('/')
        relative_destination_parent_path = '/'.join(
            parent_path_parts[1:] if len(parent_path_parts) > 1 else parent_path_parts
        )  # Exclude first directory
        destination_parent_path = self.spec.destination_path + '/' + relative_destination_parent_path
        destination_path = destination_parent_path + drive_file['name']
        if not os.path.exists(destination_parent_path):
            os.makedirs(destination_parent_path)
        return destination_path

    def _touch(self, items):
        now = datetime.utcnow()

        if not self.spec.touch:
            return

        def touch_item(item):
            modifiedTime = parse(item.get('modifiedTime'))
            if self._seconds_since(modifiedTime) > 5 * 60:  # Touch files if not touched in 5 minutes
                self.drive.files().update(
                    fileId=item['id'],
                    body={'modifiedTime': now.strftime("%Y-%m-%dT%H:%M:%S" + 'Z')}
                ).execute()
                item['modifiedTime'] = now.isoformat()
                logger.debug('touched {0}'.format(item))
                time.sleep(0.5)

        for item in items:
            if not self.running():
                return
            touch_item(item)

    def _list_items(self, root_item):
        if not root_item:
            return []

        def append_items(items=[], pageToken=None):
            result = self.drive.files().list(
                q="'{}' in parents".format(root_item['id']),
                fields="nextPageToken, files(id, name, size, mimeType, modifiedTime)",
                pageSize=1000,
                pageToken=pageToken
            ).execute()
            files = []
            for item in result.get('files', []):
                item['parent_path'] = root_item['parent_path'] + root_item['name'] + '/'
                if item['mimeType'] == 'application/vnd.google-apps.folder':
                    items += self._list_items(item)
                else:
                    files.append(item)
            items += files
            nextPageToken = result.get('nextPageToken', None)
            if nextPageToken:
                items += append_items(items, nextPageToken)
            return items

        items = append_items([root_item])
        if self.spec.matching:
            items = [
                item
                for item in items
                if fnmatch.fnmatch(item['parent_path'] + item['name'], self.spec.matching)
                   or item['mimeType'] == 'application/vnd.google-apps.folder'
            ]
        return items

    def _drive_item(self, drive_path):
        parent_id = 'root'
        names = drive_path.split('/')
        for i, name in enumerate(names):
            items = self.drive.files().list(
                q="'{0}' in parents and name = '{1}'".format(parent_id, name),
                fields="files(id, name, size, mimeType, modifiedTime)"
            ).execute().get('files', [])
            if not items:
                return None
            item = items[0]
            if i == len(names) - 1:
                item['parent_path'] = ''
                return item
            parent_id = item['id']

    def _delete(self, item):
        logger.debug('Deleting {0}'.format(item['id']))
        self.drive.files().delete(fileId=item['id']).execute()

    def _seconds_since(self, time):
        return (datetime.utcnow() - time.replace(tzinfo=None)).total_seconds()

    def _update_status(self, **kwargs):
        self._status = self._status._replace(**kwargs)
        return self._status

    def __str__(self):
        return '{0}({1})'.format(type(self).__name__, self.spec)
