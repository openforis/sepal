from image_spec import ImageSpec
from landsat.automatic_mosaic_spec import AutomaticMosaicSpec
from landsat.manual_mosaic_spec import ManualMosaicSpec
from sentinel2.automatic_mosaic_spec import Sentinel2AutomaticMosaicSpec
from sentinel2.manual_mosaic_spec import Sentinel2ManualMosaicSpec


def create(spec):
    """Creates ImageSpec.
    :rtype: ImageSpec
    """
    if spec.get('dataSet', None) == 'SENTINEL2':
        type = {
            'manual': Sentinel2ManualMosaicSpec,
            'automatic': Sentinel2AutomaticMosaicSpec,
        }[spec['type']]
        return type(spec)
    else:
        type = {
            'manual': ManualMosaicSpec,
            'automatic': AutomaticMosaicSpec,
        }[spec['type']]
        return type(spec)
