import fnmatch
import logging
import os

# noinspection PyUnresolvedReferences
from apiclient.http import MediaIoBaseDownload
from rx import Observable, combine_latest, concat, empty, interval, of
from rx.operators import flat_map, map, take_while
from sepal.drive import get_service, is_folder
from sepal.drive.rx.list import list_folder_recursively
from sepal.rx import aside, forever, using_file
from sepal.rx.workqueue import WorkQueue

from .delete import delete_file
from .observables import enqueue
from .touch import touch

CHUNK_SIZE = 10 * 1024 * 1024
TOUCH_PERIOD = 1
# TOUCH_PERIOD = 15 * 60  # Every 15 minutes - to prevent it from being garbage collected from Service Account

# Work (i.e. exports) is grouped by credentials, limiting concurrent exports per credentials
_drive_downloads = WorkQueue(
    concurrency_per_group=2,
    description='drive-exports'
)


def download(
        credentials,
        file: dict,
        destination: str,
        matching: str = None,
        delete_after_download: bool = False,
) -> Observable:
    logging.debug('downloading {} to {}'.format(file, destination))
    destination = os.path.abspath(destination)

    def get_file_destination(f):
        relative_path = f['path'][len(file['path']):]
        next_destination = '{}{}{}'.format(
            destination,
            '' if destination[-1] == '/' else '/',
            relative_path
        )
        return next_destination

    def is_file_matching(f):
        return not matching or fnmatch.fnmatch(f['path'], matching)

    def delete_downloaded(f):
        if delete_after_download:
            return delete_file(credentials, f).pipe(
                flat_map(lambda _: empty())
            )
        else:
            return empty()

    def filter_files(files):
        return [f for f in files if not is_folder(f) and is_file_matching(f)]

    def download_file(f, dest):
        total_bytes = int(f['size'])

        def next_chunk(downloader):
            status, done = downloader.next_chunk()
            logging.debug('downloaded chunk from {} to {}: {}'.format(file, destination, status))
            return 1.0 if done else status.progress()

        def download_from_drive(destination_file):
            def create_downloader():
                request = get_service(credentials).files().get_media(fileId=f['id'])
                return MediaIoBaseDownload(fd=destination_file, request=request, chunksize=CHUNK_SIZE)

            downloader = create_downloader()
            return forever().pipe(
                map(lambda _: next_chunk(downloader)),
                take_while(lambda progress: progress < 1, inclusive=True),
                map(lambda progress: {
                    'downloaded_bytes': int(total_bytes * progress),
                    'total_bytes': total_bytes,
                    'file': f
                })
            )

        def action():
            return using_file(file=dest, mode='wb', to_observable=download_from_drive)

        os.makedirs(os.path.dirname(dest), exist_ok=True)

        initial_progress_stream = of({'downloaded_bytes': 0, 'total_bytes': total_bytes, 'file': f})
        touch_stream = interval(TOUCH_PERIOD).pipe(
            flat_map(lambda _: touch(credentials, f))
        )
        download_stream = enqueue(
            credentials,
            queue=_drive_downloads,
            action=action,
            retries=0,
            description='Download {} to {}'.format(f, dest)
        ).pipe(
            aside(touch_stream)
        )

        return concat(
            initial_progress_stream,
            download_stream,
            delete_downloaded(f)
        )

    def download_folder(folder):
        def aggregate_progress(progresses: list):
            total_files = len(progresses)
            total_bytes = sum([int(p['file']['size']) for p in progresses])
            downloaded_files = len([p for p in progresses if p['downloaded_bytes'] == p['total_bytes']])
            downloaded_bytes = sum([p['downloaded_bytes'] for p in progresses])

            return {
                'downloaded_files': downloaded_files,
                'downloaded_bytes': downloaded_bytes,
                'total_files': total_files,
                'total_bytes': total_bytes
            }

        return list_folder_recursively(credentials, folder).pipe(
            map(lambda files: filter_files(files)),
            flat_map(
                lambda files: combine_latest(
                    *[download_file(f, get_file_destination(f)) for f in files]
                )
            ),
            map(aggregate_progress)
        )

    if is_folder(file):
        return download_folder(file)
    else:
        return download_file(file, destination)
