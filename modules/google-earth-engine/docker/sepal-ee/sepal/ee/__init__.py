import ee
from ee.localcredentials import ThreadLocalCredentials
from sepal.ee.radar import radar_collection, radar_mosaic, radar_time_scan, radar_viz


def get_credentials():
    credentials = ee.Credentials()
    if type(credentials) == ThreadLocalCredentials:
        credentials = credentials.get()
    if not credentials:
        raise Exception(
            'ee.InitializeThread() has not been called for current thread.'
        )
    return credentials
