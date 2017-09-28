from changedetection import ChangeDetection
from classification import Classification
from image_spec import ImageSpec
from landsat import LandsatAutomaticMosaicSpec
from landsat import LandsatManualMosaicSpec
from sentinel2 import Sentinel2AutomaticMosaicSpec
from sentinel2 import Sentinel2ManualMosaicSpec


def create(spec):
    """Creates ImageSpec.
    :rtype: ImageSpec
    """
    image_type = spec.get('imageType', 'MOSAIC')
    if image_type == 'MOSAIC':
        return _createMosaic(spec)
    if image_type == 'CLASSIFICATION':
        return Classification(spec, create)
    if image_type == 'CHANGE_DETECTION':
        return ChangeDetection(spec, create)
    else:
        raise Exception('Unexpected image image_type: ' + str(image_type))


def _createMosaic(spec):
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
