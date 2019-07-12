from rx import Observable
from sepal.drive import get_service

from .observables import execute


def delete_file(
        credentials,
        file: dict
) -> Observable:
    def action():
        get_service(credentials).files().delete(fileId=file['id']).execute()

    return execute(credentials, action, retries=3, description='delete file {}'.format(file))
