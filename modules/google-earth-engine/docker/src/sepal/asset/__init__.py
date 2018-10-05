import ee

from ..image_spec import ImageSpec
from ..aoi import AssetAoi


class Asset(ImageSpec):
    def __init__(self, spec):
        super(Asset, self).__init__()
        id = spec['recipe']['id']
        image = ee.Image(id)
        self.image = image
        self.aoi = AssetAoi(image.geometry(), {'type': 'ASSET', 'id': id})
        self.scale = image.projection().nominalScale().getInfo()
        self.bands = image.bandNames().getInfo()

    def _ee_image(self):
        return self.image
