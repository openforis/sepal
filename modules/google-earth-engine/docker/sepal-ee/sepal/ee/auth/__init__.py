import json
import os

import oauth2client.client


def load_credentials(credentials_file=os.path.expanduser('~/.config/earthengine/credentials')):
    return _AccessTokenCredentials.create(credentials_file)


class _AccessTokenCredentials(oauth2client.client.OAuth2Credentials):
    def __init__(self, credentials_file):
        super(_AccessTokenCredentials, self).__init__(
            _AccessTokenCredentials._read_access_token(credentials_file),
            None, None, None, None, None, None
        )
        self.credentials_file = credentials_file

    def _refresh(self, http):
        self.access_token = _AccessTokenCredentials._read_access_token(self.credentials_file)

    @staticmethod
    def create(credentials_file):
        if os.path.exists(credentials_file) and _AccessTokenCredentials._read_access_token(credentials_file):
            return _AccessTokenCredentials(credentials_file)
        else:
            return None

    @staticmethod
    def _read_access_token(credentials_file):
        return json.load(open(credentials_file)).get('access_token')

    def __str__(self):
        return 'AccessTokenCredentials({0})'.format(self.credentials_file)
