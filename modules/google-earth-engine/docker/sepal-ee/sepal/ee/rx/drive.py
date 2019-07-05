from threading import local

from apiclient import discovery
from rx import Callable, from_callable, of
from rx.operators import do_action, flat_map, filter, map, reduce
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
        root = {'id': 'root'}

        def find_with_parent(parent, name):
            files = self._list_with_parent(parent, name)
            return files[0] if files else None

        return _execute(
            lambda: of(*path.split('/')).pipe(
                filter(lambda name: name and name.strip()),  # Allows double // and training /
                reduce(find_with_parent, root)
            )
        )

    def list_directory(self, directory):
        return _execute(
            lambda: self._list_with_parent(directory)
        )

    def _list_with_parent(self, parent, name=None):
        if name:
            q = "'{0}' in parents and name = '{1}'".format(parent['id'], name)
        else:
            q = "'{0}' in parents".format(parent['id'])
        files = self.service.files().list(q=q, fields="files(id, name, size, mimeType, modifiedTime)").execute().get(
            'files', [])
        return files


def download_from_drive(
        source: str,
        destination: str,
        matching: str = None,
        move: bool = False
):
    drive = Drive(get_credentials())
    return drive.get_by_path(source).pipe(
        do_action(lambda file: print('got file_by_path: {}'.format(file))),
        flat_map(lambda directory: drive.list_directory(directory)),
        do_action(lambda dir: print('got list_directory: {}'.format(dir)))
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
