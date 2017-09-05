from image_spec import ImageSpec
from landsat import LandsatAutomaticMosaicSpec
from landsat import LandsatManualMosaicSpec
from sentinel2 import Sentinel2AutomaticMosaicSpec
from sentinel2 import Sentinel2ManualMosaicSpec


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
            'manual': LandsatManualMosaicSpec,
            'automatic': LandsatAutomaticMosaicSpec,
        }[spec['type']]
        return type(spec)
