from rx import Observable
from sepal.drive import get_service

from .observables import execute


def delete_file(file: dict) -> Observable:
    def action():
        get_service().files().delete(fileId=file['id']).execute()

    return execute(action)
