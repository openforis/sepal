import ee

from ..image_spec import ImageSpec
from ..aoi import AssetAoi


class Asset(ImageSpec):
    def __init__(self, spec):
        super(Asset, self).__init__()
        id = spec['recipe'].get('id')
        if not id:
            asset_roots = ee.data.getAssetRoots()
            if not asset_roots:
                raise Exception('User has no GEE asset roots')
            id = asset_roots[0]['id'] + '/' + spec['recipe']['path']
        image = ee.Image(id)
        self.image = image
        self.aoi = AssetAoi(image.geometry(), {'type': 'ASSET', 'id': id})
        self.scale = image.projection().nominalScale().getInfo()
        self.bands = image.bandNames().getInfo()
        self.viz_params = spec['recipe'].get('vizParams')

    def _ee_image(self):
        return self.image

    def _viz_params(self):
        return self.viz_params

