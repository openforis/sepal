from .asset import Asset
from .classification import Classification
from .radar import RadarMosaic
from .image_spec import ImageSpec
from .landsat import LandsatAutomaticMosaicSpec
from .landsat import LandsatManualMosaicSpec
from .reciperef import RecipeRef
from .sentinel2 import Sentinel2AutomaticMosaicSpec
from .sentinel2 import Sentinel2ManualMosaicSpec
from .sentinel2landsat import Sentinel2LandsatMosaicSpec


def create(sepal_api, spec):
    """Creates ImageSpec.
    :rtype: ImageSpec
    """
    image_type = spec['recipe']['type']
    if image_type == 'MOSAIC':
        return _create_mosaic(spec)
    if image_type == 'RADAR_MOSAIC':
        return RadarMosaic(spec)
    if image_type == 'CLASSIFICATION':
        return Classification(sepal_api, spec, create)
    if image_type == 'ASSET':
        return Asset(spec)
    if image_type == 'RECIPE_REF':
        return RecipeRef(sepal_api, spec, create)
    else:
        raise Exception('Unexpected image image_type: ' + str(image_type))


def _create_mosaic(spec):
    model = spec['recipe']['model']
    sources = model['sources']
    if len(sources) == 2:
        return Sentinel2LandsatMosaicSpec(spec)

    source = list(sources.keys())[0]
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
