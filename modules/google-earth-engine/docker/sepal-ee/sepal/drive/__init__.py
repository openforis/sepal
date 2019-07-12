import logging
from threading import local

from apiclient import discovery

_local = local()
logging.getLogger('googleapiclient').setLevel(logging.WARNING)


def get_service(credentials):
    service = getattr(_local, 'service', None)
    if not service:
        service = discovery.build(serviceName='drive', version='v3', cache_discovery=False, credentials=credentials)
        _local.service = service
    return service


def is_folder(file):
    return file['mimeType'] == 'application/vnd.google-apps.folder'
