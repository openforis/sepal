from rx import Observable
from sepal.drive import get_service

from .observables import execute


def delete_file(
        credentials,
        file: dict,
        retries: int = 2
) -> Observable:
    def action():
        get_service(credentials).files().delete(fileId=file['id']).execute()

    return execute(credentials, action, retries=retries, description='delete file {}'.format(file))
