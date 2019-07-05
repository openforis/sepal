from threading import local

from apiclient import discovery
from rx import Callable, concat, from_callable, of, throw
from rx.operators import flat_map, filter, map, reduce
from sepal.rx.workqueue import WorkQueue

from . import get_credentials


class Drive(local):
    def __init__(self, credentials):
        self.service = discovery.build(
            serviceName='drive',
            version='v3',
            cache_discovery=False,
            credentials=credentials
        )

    def get_by_path(self, path):
        root_stream = of({'id': 'root'})

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
            )

        )

    def list_folder(self, parent, name_filter=None):
        def action():
            if name_filter:
                q = "'{0}' in parents and name = '{1}'".format(parent['id'], name_filter)
            else:
                q = "'{0}' in parents".format(parent['id'])
            return self.service.files().list(q=q, fields="files(id, name, size, mimeType, modifiedTime)").execute().get(
                'files', [])

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


def _is_folder(file):
    return file['mimeType'] == 'application/vnd.google-apps.folder'


def download_from_drive(
        source: str,
        destination: str,
        matching: str = None,
        move: bool = False
):
    drive = Drive(get_credentials())
    return drive.get_by_path(source).pipe(
        flat_map(lambda directory: drive.list_folder_recursively(directory))
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
