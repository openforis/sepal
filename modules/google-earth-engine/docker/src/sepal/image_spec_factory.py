from changedetection import ChangeDetection
from classification import Classification
from asset import Asset
from image_spec import ImageSpec
from landsat import LandsatAutomaticMosaicSpec
from landsat import LandsatManualMosaicSpec
from sentinel2 import Sentinel2AutomaticMosaicSpec
from sentinel2 import Sentinel2ManualMosaicSpec


def create(spec):
    """Creates ImageSpec.
    :rtype: ImageSpec
    """
    image_type = spec['recipe']['type']
    if image_type == 'MOSAIC':
        return _createMosaic(spec)
    if image_type == 'CLASSIFICATION':
        return Classification(spec, create)
    if image_type == 'CHANGE_DETECTION':
        return ChangeDetection(spec, create)
    if image_type == 'ASSET':
        return Asset(spec)
    else:
        raise Exception('Unexpected image image_type: ' + str(image_type))


def _createMosaic(spec):
    model = spec['recipe']['model']
    source = model['sources'].keys()[0]
    scene_selection_type = model['sceneSelectionOptions']['type']
    if source == 'SENTINEL_2':
        type = {
            'SELECT': Sentinel2ManualMosaicSpec,
            'ALL': Sentinel2AutomaticMosaicSpec,
        }[scene_selection_type]
        return type(spec)
    else:
        type = {
            'SELECT': LandsatManualMosaicSpec,
            'ALL': LandsatAutomaticMosaicSpec,
        }[scene_selection_type]
        return type(spec)
