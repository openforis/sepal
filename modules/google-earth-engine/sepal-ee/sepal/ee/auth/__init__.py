import os

import ee


def load_credentials(credentials_file=os.path.expanduser('~/.config/earthengine/credentials')):
    credentials = ee.oauth.AccessTokenCredentials.create(credentials_file)
    if not credentials:
        raise ValueError('Unable to load credentials from {}'.format(credentials_file))
    return credentials
