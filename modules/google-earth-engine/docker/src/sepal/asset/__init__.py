import ee

from .. import ImageSpec
from ..aoi import Geometry


class Asset(ImageSpec):
    def __init__(self, spec):
        super(Asset, self).__init__()
        image = ee.Image(spec['id'])
        self.image = image
        self.aoi = Geometry(image.geometry())
        self.scale = image.projection().nominalScale().getInfo()
        self.bands = image.bandNames().getInfo()

    def _ee_image(self):
        return self.image
