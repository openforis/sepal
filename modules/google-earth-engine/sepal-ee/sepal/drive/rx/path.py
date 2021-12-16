import logging

from googleapiclient.errors import HttpError
from rx import Observable, empty, from_list, of, zip
from rx.operators import filter, first, flat_map, last, map, merge_scan
from sepal.rx import throw

from .create_folder import create_folder
from .delete import delete_file
from .download import download
from .list import list_folder

_root_folder = {'id': 'root', 'name': 'root', 'path': '/'}


def file_with_path(
        credentials,
        path: str,
        retries: int = 5
) -> Observable:
    return _files_in_path(credentials, path, retries).pipe(
        last(),
        flat_map(lambda file: of(file) if file else throw(Exception('File {} does not exist.'.format(path)))),
    )


def download_path(
        credentials,
        path: str,
        destination: str,
        matching: str = None,
        delete_after_download: bool = False,
        retries: int = 5
) -> Observable:
    return file_with_path(credentials, path).pipe(
        flat_map(
            lambda file: download(
                credentials,
                file=file,
                destination=destination,
                matching=matching,
                delete_after_download=delete_after_download,
                retries=retries
            )
        )
    )


def create_folder_with_path(credentials, path: str, retries: int = 5):
    def create_if_missing(parent, name_file):
        name = name_file[0]
        file = name_file[1]
        if file:
            return of(file)
        else:
            return create_folder(credentials, parent, name, retries=retries)

    return zip(
        _path_elements(path),
        _files_in_path(credentials, path, retries=retries),
    ).pipe(
        merge_scan(create_if_missing, _root_folder),
        last()
    )


def delete_file_with_path(credentials, path: str, retries: int = 2):
    def delete(file):
        try:
            return delete_file(credentials, file, retries)
        except HttpError:
            logging.warning('Failed to delete file {} with path {}'.format(file, path))
            return empty()

    return _files_in_path(credentials, path, retries).pipe(
        last(),
        filter(lambda file: file),
        flat_map(lambda file: delete(file))
    )


def _files_in_path(credentials, path, retries):
    def find_with_parent(parent, name):
        return (list_folder(credentials, parent, name_filter=name, retries=retries) if parent else of([])).pipe(
            first(),  # There might be more than one file with the same name - we just take the first
            map(lambda files: files[0] if len(files) else None)
        )

    return _path_elements(path).pipe(
        merge_scan(find_with_parent, _root_folder)
    )


def _path_elements(path):
    return from_list(path.split('/')).pipe(
        filter(lambda name: name and name.strip())  # Allow for double // and trailing / in path
    )
