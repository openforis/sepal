import os

from ee.auth import AccessTokenCredentials


def load_credentials(credentials_file=os.path.expanduser('~/.config/earthengine/credentials')):
    return AccessTokenCredentials.create(credentials_file)
