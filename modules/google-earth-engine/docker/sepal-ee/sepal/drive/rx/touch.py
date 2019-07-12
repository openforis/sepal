from datetime import datetime

from sepal.drive import get_service
from sepal.drive.rx.observables import execute


def touch(credentials, file):
    def action():
        get_service(credentials).files().update(
            fileId=file['id'],
            body={'modifiedTime': datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S" + 'Z')}
        ).execute()

    return execute(credentials, action, description='touch {}'.format(file))
