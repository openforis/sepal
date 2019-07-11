import fnmatch
import os

from apiclient.http import MediaIoBaseDownload
from rx import Observable, of
from rx.operators import do_action, flat_map, map, scan, take_while
from sepal.drive import get_service, is_folder
from sepal.drive.rx.list import list_folder_recursively
from sepal.rx import forever, using_file

from .delete import delete_file
from .observables import execute

CHUNK_SIZE = 10 * 1024 * 1024


def download_file(
        file: dict,
        destination: str
) -> Observable:
    destination = os.path.abspath(destination)

    def create_downloader(destination_file):
        request = get_service().files().get_media(fileId=file['id'])
        return MediaIoBaseDownload(fd=destination_file, request=request, chunksize=CHUNK_SIZE)

    def next_chunk(downloader):
        status, done = downloader.next_chunk()
        return 1.0 if done else status.progress()

    def download(destination_file):
        do_action(lambda _: os.makedirs(destination_file, exist_ok=True))
        return of(create_downloader(destination_file)).pipe(
            flat_map(
                lambda downloader: forever().pipe(
                    map(lambda _: next_chunk(downloader)),
                    take_while(lambda progress: progress < 1, inclusive=True),
                    map(lambda progress: {
                        'progress': progress,
                        'downloaded_bytes': int(int(file['size']) * progress),
                        'file': file
                    })
                )
            )
        )

    def action():
        return using_file(file=destination, mode='wb', to_observable=download)

    os.makedirs(os.path.dirname(destination), exist_ok=True)
    return execute(action, retries=0, description='Download {} to {}'.format(file, destination))


def download_directory(
        file: dict,
        destination: str,
        matching: str = None,
        delete_after_download: bool = False
) -> Observable:
    destination = os.path.abspath(destination)

    def get_destination(f):
        relative_path = f['path'][len(file['path']):]
        next_destination = '{}{}{}'.format(
            destination,
            '' if destination[-1] == '/' else '/',
            relative_path
        )
        return next_destination

    def initial_stats(files):
        return {
            'progress': 0,
            'total_files': len(files),
            'total_bytes': sum([int(f.get('size', 0)) for f in files]),
            'downloaded_files': 0,
            'downloaded_bytes': 0
        }

    def update_stats(stats, download):
        downloaded_files = stats['downloaded_files'] + (0 if download['progress'] < 1 else 1)
        downloaded_bytes = stats['downloaded_bytes'] + download['downloaded_bytes']
        progress = downloaded_bytes / stats['total_bytes']
        return {
            'progress': progress,
            'total_files': stats['total_files'],
            'total_bytes': stats['total_bytes'],
            'downloaded_files': downloaded_files,
            'downloaded_bytes': downloaded_bytes
        }

    def is_file_matching(f):
        return not matching or fnmatch.fnmatch(f['path'], matching)

    def delete_downloaded(downloaded):
        if delete_after_download:
            return delete_file(downloaded['file']).pipe(
                map(lambda _: downloaded)
            )
        else:
            return of(downloaded)

    def filter_files(files):
        return [f for f in files if not is_folder(f) and is_file_matching(f)]

    if is_folder(file):
        return list_folder_recursively(file).pipe(
            map(lambda files: filter_files(files)),
            flat_map(
                lambda files: of(True).pipe(
                    flat_map(lambda _: of(*files).pipe(
                        flat_map(lambda f: download_file(f, get_destination(f))),
                        flat_map(delete_downloaded)
                    )),
                    scan(update_stats, initial_stats(files))
                )
            )
        )
    else:
        return download_file(file, destination)
