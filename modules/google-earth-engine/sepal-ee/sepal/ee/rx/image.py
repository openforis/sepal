import ee
from rx import Observable

from .observables import execute


def get_band_names(credentials, image: ee.Image) -> Observable:
    def action():
        return image.bandNames().getInfo()

    return execute(
        credentials,
        action,
        description='band_names()',
        retries=3
    )
