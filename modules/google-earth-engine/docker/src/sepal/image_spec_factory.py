from image_spec import ImageSpec
from landsat.automatic_mosaic_spec import AutomaticMosaicSpec
from landsat.manual_mosaic_spec import ManualMosaicSpec


def create(spec):
    """Foo

    :rtype: ImageSpec
    """
    type = {
        'manual': ManualMosaicSpec,
        'automatic': AutomaticMosaicSpec,
    }[spec['type']]
    return type(spec)
