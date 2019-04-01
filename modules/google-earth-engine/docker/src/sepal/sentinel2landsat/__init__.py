import _strptime
from abc import abstractmethod

import ee
from ..mosaic_spec import MosaicSpec
from ..landsat import LandsatAutomaticMosaicSpec
from ..sentinel2 import Sentinel2AutomaticMosaicSpec

str(_strptime.__all__)  # Workaround for "Failed to import _strptime because the import lock is held by another thread."


class Sentinel2LandsatMosaicSpec(MosaicSpec):
    def __init__(self, spec):
        super(Sentinel2LandsatMosaicSpec, self).__init__(spec)

    def _data_sets(self):
        return [Sentinel2DataSet(self._create_image_filter())]

    @abstractmethod
    def _create_image_filter(self):
        """Creates an ee.Filter based on the spec.

        :return: A ee.Filter
        :rtype: ee.Filter
        """
        raise AssertionError('Method in subclass expected to have been invoked')

