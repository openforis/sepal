import os
from threading import local

from apiclient import discovery
from apiclient.http import MediaIoBaseDownload
from rx import Callable, concat, from_callable, of, throw
from rx.operators import do_action, flat_map, filter, first, map, reduce, take_while

from sepal.ee.rx import get_credentials
from sepal.rx import forever, using_file
from sepal.rx.workqueue import WorkQueue

CHUNK_SIZE = 10 * 1024 * 1024


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
        def action():
            if name_filter:
                q = "'{0}' in parents and name = '{1}'".format(folder['id'], name_filter)
            else:
                q = "'{0}' in parents".format(folder['id'])
            files = self.service.files().list(
                q=q,
                fields="files(id, name, size, mimeType, modifiedTime)"
            ).execute().get('files', [])
            for file in files:
                file['path'] = '{}{}{}'.format(
                    folder['path'],
                    file['name'].replace('/', '_'),
                    '/' if _is_folder(file) else ''
                )
            return files

        # TODO: Deal with pagination

        return _execute(action)

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
            reduce(lambda acc, files: acc + files, [])
        )

    def download(self, file, destination):
        destination = os.path.abspath(destination)

        def create_downloader(destination_file):
            request = self.service.files().get_media(fileId=file['id'])
            return MediaIoBaseDownload(fd=destination_file, request=request, chunksize=CHUNK_SIZE)

        def next_chunk(downloader):
            status, done = downloader.next_chunk()
            return 1.0 if done else status.progress()

        def download_file(destination_file):
            do_action(lambda _: os.makedirs(destination_file, exist_ok=True))
            return of(create_downloader(destination_file)).pipe(
                flat_map(
                    lambda downloader: forever().pipe(
                        map(lambda _: next_chunk(downloader)),
                        take_while(lambda progress: progress < 1, inclusive=True),
                        map(lambda progress: {
                            'progress': progress,
                            'downloaded_bytes': int(int(file['size']) * progress)
                        })
                    )
                )
            )

        def action():
            return using_file(file=destination, mode='wb', to_observable=download_file)

        os.makedirs(os.path.dirname(destination), exist_ok=True)
        return _execute(action, retries=0, description='Download {} to {}'.format(file, destination))

    def download_all(self, file, destination):
        destination = os.path.abspath(destination)

        def get_destination(f):
            relative_path = f['path'][len(file['path']):]
            next_destination = '{}{}{}'.format(
                destination,
                '' if destination[-1] == '/' else '/',
                relative_path
            )
            return next_destination

        if _is_folder(file):
            return self.list_folder_recursively(file).pipe(
                flat_map(lambda files: of(*files)),
                filter(lambda f: not _is_folder(f)),
                # TODO: Come up with a new destination based on f['path'] and file['path'] difference
                flat_map(lambda f: self.download(f, get_destination(f)))
            )
        else:
            return self.download(file, destination)


def _is_folder(file):
    return file['mimeType'] == 'application/vnd.google-apps.folder'


def download_from_drive(
        source: str,
        destination: str,
        matching: str = None,
        move: bool = False
):
    drive = Drive(get_credentials())
    to_download = drive.get_by_path(source)
    return to_download.pipe(
        flat_map(lambda file: drive.download_all(file, destination)),
    )


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
