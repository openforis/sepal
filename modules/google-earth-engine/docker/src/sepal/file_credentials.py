import os
from oauth2client.client import OAuth2Credentials


class FileCredentials(OAuth2Credentials):
    def __init__(self, access_token_file):
        access_token = self._read_access_token(access_token_file)
        super(FileCredentials, self).__init__(access_token, None, None, None, None, None, None)
        self.access_token_file = access_token_file

    def _refresh(self, http):
        self.access_token = self._read_access_token(self.access_token_file)

    def _read_access_token(self, access_token_file):
        access_token = None
        if os.path.exists(access_token_file):
            with file(access_token_file) as f:
                access_token = f.read()
        return access_token

    def __str__(self):
        return 'FileCredentials(' + self.access_token_file + ')'
