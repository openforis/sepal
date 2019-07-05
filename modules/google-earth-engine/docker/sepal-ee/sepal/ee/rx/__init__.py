import ee
from ee.localcredentials import ThreadLocalCredentials


def get_credentials():
    credentials = ee.Credentials()
    if type(credentials) == ThreadLocalCredentials:
        credentials = credentials.get()
    if not credentials:
        raise Exception(
            'No credentials is provided and ee.InitializeThread() has not been called for current thread.'
        )
    return credentials
