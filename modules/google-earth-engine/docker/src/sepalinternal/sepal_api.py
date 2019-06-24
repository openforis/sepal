import requests
import urllib3
from .sepal_exception import SepalException

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class SepalApi:
    def __init__(self, host, username, password):
        self.host = host
        self.username = username
        self.password = password

    def _get(self, path, params=None):
        return requests.get(
            'https://{}/api{}'.format(self.host, path),
            params=params,
            timeout=10,
            verify=False,
            auth=(self.username, self.password)
        )

    def get_recipe(self, recipe_id):
        response = self._get('/processing-recipes/{}'.format(recipe_id))
        if response.status_code != 200:
            raise SepalException(code='gee.error.failedToLoadRecipe', message='Failed to load recipe.')
        return response.json()
