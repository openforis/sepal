import _strptime

from ..landsat import LandsatAutomaticMosaicSpec
from ..mosaic_spec import MosaicSpec
from ..sentinel2 import Sentinel2AutomaticMosaicSpec

str(_strptime.__all__)  # Workaround for "Failed to import _strptime because the import lock is held by another thread."


class Sentinel2LandsatMosaicSpec(MosaicSpec):
    def __init__(self, spec):
        super(Sentinel2LandsatMosaicSpec, self).__init__(spec)
        self.brdf_correct = False
        self.landsat = LandsatAutomaticMosaicSpec(spec)
        self.sentinel2 = Sentinel2AutomaticMosaicSpec(spec)
        self.surface_reflectance = self.landsat.surface_reflectance
        self.scale = min(self.landsat.scale, self.sentinel2.scale)

    def _data_sets(self):
        return _flatten([self.landsat._data_sets(), self.sentinel2._data_sets()])


def _flatten(iterable):
    return [item for sublist in iterable for item in sublist]
