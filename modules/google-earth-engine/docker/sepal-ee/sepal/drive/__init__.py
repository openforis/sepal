from threading import local

from apiclient import discovery

_local = local()


# noinspection PyPep8Naming
def InitializeThread(credentials):
    if not credentials:
        raise ValueError('No credentials provided')
    _local.credentials = credentials
    _local.service = discovery.build(
        serviceName='drive',
        version='v3',
        cache_discovery=False,
        credentials=credentials
    )


def get_service():
    service = getattr(_local, 'service', None)
    if not service:
        raise Exception('sepal.drive.InitializeThread() not called in current thread')
    return service


def get_credentials():
    credentials = getattr(_local, 'credentials', None)
    if not credentials:
        raise Exception('sepal.drive.InitializeThread() not called in current thread')
    return credentials


def is_folder(file):
    return file['mimeType'] == 'application/vnd.google-apps.folder'
