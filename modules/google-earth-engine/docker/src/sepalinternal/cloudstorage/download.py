from collections import namedtuple

import google.auth
import google.auth.transport.requests as tr_requests
from google.cloud import storage
from google.resumable_media.requests import ChunkedDownload

from ..task.task import ThreadTask


class CloudStorageDownload(ThreadTask):
    Spec = namedtuple('CloudStorageDownload', 'environment, source_path, destination_path, matching, move')
    Status = namedtuple('DownloadStatus', 'state, total_files, total_bytes, downloaded_files, downloaded_bytes')

    def __init__(self, environment, source_path, destination_path, matching=None, move=False):
        super(CloudStorageDownload, self).__init__()
        self.spec = self.Spec(environment, source_path, destination_path, matching, move)
        self._status = self.Status(
            state=self.state,
            total_files=None,
            total_bytes=None,
            downloaded_files=0,
            downloaded_bytes=0
        )

    def run(self):
        blobs = self._list_blobs_to_download()
        self._update_status(
            state=self.state,
            total_files=len(blobs),
            total_bytes=sum([blob.size for blob in blobs])
        )
        for blob in blobs:
            self._download_blob(blob)
        self.resolve()

    def _download_blob(self, blob):
        destination_file = self._destination_file(blob.name)
        transport = _create_transport()
        chunk_size = 10 * 1024 * 1024  # 10MB
        download = ChunkedDownload(blob.media_link, chunk_size, destination_file)
        initial_bytes_downloaded = self._status.downloaded_bytes
        while not download.finished:
            download.consume_next_chunk(transport)
            self._update_status(downloaded_bytes=initial_bytes_downloaded + download.bytes_downloaded)
        self._update_status(downloaded_files=self._status.downloaded_files + 1)

    def _list_blobs_to_download(self):
        spec = self.spec
        bucket = _get_or_create_bucket(spec.environment)
        if spec.matching:
            return list(bucket.list_blobs(prefix=spec.source_path + '/'))
        else:
            return [bucket.get_blob(spec.source_path)]

    def __str__(self):
        return '{0}({1})'.format(type(self).__name__, self.spec)

    def _destination_file(self, blob_name):
        relative_path = blob_name[len(self.spec.source_path):]
        if not relative_path:
            relative_path = blob_name[blob_name.rfind('/'):]
        path = self.spec.destination_path + relative_path
        return open(path, 'wb')

    def _update_status(self, **kwargs):
        self._status = self._status._replace(**kwargs)
        return self._status


def _create_transport():
    ro_scope = 'https://www.googleapis.com/auth/devstorage.read_only'
    credentials, _ = google.auth.default(scopes=(ro_scope,))
    return tr_requests.AuthorizedSession(credentials)


def _get_or_create_bucket(environment):
    client = storage.Client()
    bucket_name = 'sepal_' + environment + '_exports'
    bucket = client.lookup_bucket(bucket_name)
    bucket.add_lifecycle_delete_rule(age=1)
    if not bucket:
        bucket = client.create_bucket(bucket_name)
    return bucket
