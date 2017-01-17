import ee
import sys
from oauth2client.service_account import ServiceAccountCredentials
from aoi import Aoi
from image_spec import ImageSpec
credentials = ServiceAccountCredentials.from_p12_keyfile(
    service_account_email=sys.argv[1],
    filename=sys.argv[2],
    private_key_password='notasecret',
    scopes=ee.oauth.SCOPE + ' https://www.googleapis.com/auth/drive ')
ee.Initialize(credentials)
