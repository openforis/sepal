import fnmatch
import json
import logging
import os
import random
import time
from collections import namedtuple
from datetime import datetime
from threading import Semaphore

import httplib2
from apiclient import discovery
from apiclient.http import MediaIoBaseDownload
from googleapiclient.errors import HttpError

from ..exception import re_raisable
from ..task.task import ThreadTask

try:
    import Queue as queue
except ImportError:
    import queue

logger = logging.getLogger(__name__)
download_semaphore = Semaphore(1)


def create_folder(credentials, name):
    try:
        with Drive(credentials) as drive:
            return retry(lambda: drive.files().create(
                body={'name': name, 'mimeType': 'application/vnd.google-apps.folder'},
                fields='id'
            ).execute())
    except HttpError as e:
        e.message = e._get_reason()
        re_raisable()
        raise e


def delete(credentials, item):
    try:
        with Drive(credentials) as drive:
            logger.debug('Deleting {0}'.format(item))
            retry(lambda: drive.files().delete(fileId=item['id']).execute())
    except Exception:
        pass  # Ignore failure to delete file


def retry(action, times=1):
    try:
        return action()
    except HttpError as e:
        content = json.loads(e.content)
        reason = content.get('reason', None)
        if times < 20:
            throttle_seconds = max(2 ^ int(times * random.uniform(0.1, 0.2)), 30)
            logger.warn('Retrying drive operation in {1} seconds after try #{2}: {3}'.format(throttle_seconds, times, reason))
            time.sleep(throttle_seconds)
            return retry(action, times + 1)
        e.message = e._get_reason()
        re_raisable()
        raise e
    except Exception as e:
        if times < 20:
            throttle_seconds = max(2 ^ int(times * random.uniform(0.1, 0.2)), 30)
            logger.warn('Retrying drive operation in {1} seconds after try #{2}: {3}'.format(throttle_seconds, times, str(e)))
            time.sleep(throttle_seconds)
            return retry(action, times + 1)
        re_raisable()
        raise e


class Download(ThreadTask):
    Status = namedtuple('DownloadStatus', 'state, total_files, total_bytes, downloaded_files, downloaded_bytes')
    DownloadSpec = namedtuple('DownloadSpec', 'credentials, drive_path, destination_path, matching, move')

    def __init__(self, credentials, drive_path, destination_path, matching=None, move=False):
        self.spec = self.DownloadSpec(credentials, drive_path, destination_path, matching, move)
        super(Download, self).__init__(semaphore=download_semaphore)
        self._status = self.Status(
            state=self.state,
            total_files=None,
            total_bytes=None,
            downloaded_files=0,
            downloaded_bytes=0
        )

    def run(self):
        with Drive(self.spec.credentials) as drive:
            self.drive = drive
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
                self._download_file(drive_file)
                if not self.running():
                    return
                if self.spec.move:
                    self._delete(drive_file)
                time.sleep(1)

            if self.spec.move and not self.spec.matching:
                self._delete(root_item)

            self.resolve()

    def _download_file(self, drive_file):
        destination_path = self._create_destination_path(drive_file)
        downloaded_bytes_without_file = self.status().downloaded_bytes
        downloaded_files_without_file = self.status().downloaded_files
        file_size = int(drive_file['size'])
        last_exception = None
        max_retries = 10
        for times in range(0, max_retries):
            if not self.running():
                return
            logger.debug('Downloading {0} to {1}. retry={2}'.format(drive_file, destination_path, times))
            try:
                with open(destination_path, 'w') as destination_file:
                    request = retry(lambda: self.drive.files().get_media(fileId=drive_file['id']))
                    downloader = MediaIoBaseDownload(fd=destination_file, request=request, chunksize=10 * 1024 * 1024)
                    while self.running():
                        logger.debug(
                            'Downloading chunk of {0} to {1}. retry={2}'.format(drive_file, destination_path, times))
                        status, done = retry(lambda: downloader.next_chunk())
                        self._update_status(
                            downloaded_bytes=int(downloaded_bytes_without_file + file_size * status.progress())
                        )
                        if done:
                            destination_file.flush()
                            os.fsync(destination_file.fileno())
                            self._update_status(
                                downloaded_files=downloaded_files_without_file + 1
                            )
                            return
            except HttpError as e:
                e.message = e._get_reason()
                last_exception = re_raisable()
                logger.warn('Failed to download {0} to {1}. retry={2}, error={3}'
                            .format(drive_file, destination_path, times, last_exception.message))

        self.reject(last_exception)

    def status(self):
        return self._update_status(state=self.state)

    def close(self):
        logger.debug('closing {0}, {1}'.format(self.spec.drive_path, self.spec.matching))

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

    def _list_items(self, root_item):
        if not root_item:
            return []

        def append_items(items=[], pageToken=None):
            result = retry(lambda: self.drive.files().list(
                q="'{}' in parents".format(root_item['id']),
                fields="nextPageToken, files(id, name, size, mimeType, modifiedTime)",
                pageSize=1000,
                pageToken=pageToken
            ).execute())
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
            items = retry(lambda: self.drive.files().list(
                q="'{0}' in parents and name = '{1}'".format(parent_id, name),
                fields="files(id, name, size, mimeType, modifiedTime)"
            ).execute().get('files', []))
            if not items:
                return None
            item = items[0]
            if i == len(names) - 1:
                item['parent_path'] = ''
                return item
            parent_id = item['id']

    def _delete(self, item):
        logger.debug('Deleting {0}'.format(item['id']))
        retry(lambda: self.drive.files().delete(fileId=item['id']).execute())
        3

    def _seconds_since(self, time):
        return (datetime.utcnow() - time.replace(tzinfo=None)).total_seconds()

    def _update_status(self, **kwargs):
        self._status = self._status._replace(**kwargs)
        return self._status

    def __str__(self):
        return '{0}({1})'.format(type(self).__name__, self.spec)


class Touch(ThreadTask):
    def __init__(self, drive_items, credentials):
        super(Touch, self).__init__(retries=3)
        self.drive_items = drive_items
        self.credentials = credentials

    def run(self):
        time.sleep(15 * 60)  # Don't touch very often
        while self.running():
            with Drive(self.credentials) as drive:
                for item in self.drive_items:
                    try:
                        retry(lambda: drive.files().update(
                            fileId=item['id'],
                            body={'modifiedTime': datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S" + 'Z')}
                        ).execute())
                        logger.debug('Touched {0}'.format(item))
                    except:
                        pass
                    time.sleep(1)

    def __str__(self):
        return '{0}(drive_files={1})'.format(type(self).__name__, self.drive_items)


class Drive:
    def __init__(self, credentials):
        self.credentials = credentials

    def __enter__(self):
        return discovery.build('drive', 'v3', http=(self.credentials.authorize(httplib2.Http())))

    def __exit__(self, type, value, traceback):
        pass
