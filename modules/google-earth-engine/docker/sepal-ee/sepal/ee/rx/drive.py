import fnmatch
import os
from threading import local

from apiclient import discovery
from apiclient.http import MediaIoBaseDownload
from rx import Callable, concat, empty, from_callable, of, throw
from rx.operators import do_action, expand, flat_map, filter, first, map, reduce, scan, take_while
from sepal.ee.rx import get_credentials
from sepal.rx import forever, using_file
from sepal.rx.workqueue import WorkQueue

CHUNK_SIZE = 10 * 1024 * 1024
PAGE_SIZE = 100


class Drive(local):
    def __init__(self, credentials):
        self.service = discovery.build(
            serviceName='drive',
            version='v3',
            cache_discovery=False,
            credentials=credentials
        )

    def get_by_path(self, path):
        root_stream = of({'id': 'root', 'path': '/'})

        def find_with_parent(parent_stream, name):
            return parent_stream.pipe(
                flat_map(lambda parent: self.list_folder(parent, name_filter=name)),
                map(lambda files: files[0] if len(files) else None),
                flat_map(lambda file: of(file) if file else throw(Exception('File {} does not exist.'.format(path))))
            )

        return of(*path.split('/')).pipe(
            filter(lambda name: name and name.strip()),  # Allows double // and training /
            reduce(find_with_parent, root_stream),
            flat_map(
                lambda file_stream: file_stream.pipe(
                    map(lambda file: file)
                )
            ),
            first()
        )

    def list_folder(self, folder, name_filter=None):
        def next_page(acc):
            def load_page():
                if name_filter:
                    q = "'{0}' in parents and name = '{1}'".format(folder['id'], name_filter)
                else:
                    q = "'{0}' in parents".format(folder['id'])
                page = self.service.files().list(
                    q=q,
                    fields="nextPageToken, files(id, name, size, mimeType, modifiedTime)",
                    pageSize=PAGE_SIZE,
                    pageToken=acc.get('nextPageToken')).execute()
                return page

            return _execute(load_page, retries=0).pipe(
                map(lambda page: {
                    'files': acc['files'] + page.get('files', []),
                    'nextPageToken': page.get('nextPageToken')
                })
            )

        def extract_files(result):
            files = result.get('files', [])
            for file in files:
                file['path'] = '{}{}{}'.format(
                    folder['path'],
                    file['name'].replace('/', '_'),
                    '/' if _is_folder(file) else ''
                )
            return files

        return next_page({'files': [], 'nextPageToken': None}).pipe(
            expand(lambda acc: next_page(acc) if acc.get('nextPageToken') else empty()),
            map(extract_files)
        )

    def list_folder_recursively(self, folder):
        def recurse(file):
            if _is_folder(file):
                return concat(
                    of([file]),
                    self.list_folder_recursively(file),
                )
            else:
                return of([file])

        return self.list_folder(folder).pipe(
            flat_map(lambda files: of(*files)),
            flat_map(recurse),
            reduce(lambda acc, files: acc + files, []),
        )

    def download_file(self, file, destination):
        destination = os.path.abspath(destination)

        def create_downloader(destination_file):
            request = self.service.files().get_media(fileId=file['id'])
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
        return _execute(action, retries=0, description='Download {} to {}'.format(file, destination))

    def download_directory(self, file, destination, matching=None, delete_after_download=False):
        destination = os.path.abspath(destination)

        def get_destination(f):
            relative_path = f['path'][len(file['path']):]
            next_destination = '{}{}{}'.format(
                destination,
                '' if destination[-1] == '/' else '/',
                relative_path
            )
            return next_destination

        def seed_stats(files):
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
                return self.delete_file(downloaded['file']).pipe(
                    map(lambda _: downloaded)
                )
            else:
                return of(downloaded)

        if _is_folder(file):
            return self.list_folder_recursively(file).pipe(
                flat_map(
                    lambda files: of(True).pipe(
                        flat_map(lambda _: of(*files).pipe(
                            filter(lambda f: not _is_folder(f)),
                            filter(is_file_matching),
                            flat_map(lambda f: self.download_file(f, get_destination(f))),
                            flat_map(delete_downloaded)
                        )),
                        scan(update_stats, seed_stats(files))
                    )
                )
            )
        else:
            return self.download_file(file, destination)

    def delete_file(self, file):
        def action():
            self.service.files().delete(fileId=file['id']).execute()

        return _execute(action)


def download_from_drive(
        source: str,
        destination: str,
        matching: str = None,
        delete_after_download: bool = False
):
    drive = Drive(get_credentials())
    return drive.get_by_path(source).pipe(
        flat_map(
            lambda file: drive.download_directory(
                file=file,
                destination=destination,
                matching=matching,
                delete_after_download=delete_after_download
            )
        )
    )


def _is_folder(file):
    return file['mimeType'] == 'application/vnd.google-apps.folder'


_drive_executions = WorkQueue(
    concurrency_per_group=2,
    description='earth-engine-exports'
)


def _execute(
        action: Callable,
        retries: int = 3,
        description: str = None
):
    return _drive_executions.enqueue(
        observable=from_callable(action, _drive_executions.scheduler),
        retries=retries,
        description=description
    )
