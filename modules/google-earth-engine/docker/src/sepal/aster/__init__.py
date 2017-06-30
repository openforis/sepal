from abc import abstractmethod

import ee
from datetime import datetime

from normalizer import Normalizer
from .. import MosaicSpec
from ..mosaic import CollectionDef


class AsterMosaicSpec(MosaicSpec):
    def __init__(self, spec):
        super(AsterMosaicSpec, self).__init__(spec)
        self.scale = 30 if set(self.bands).issubset(['swir1', 'swir2']) else 15

    def normalize(self, image):
        return Normalizer(image).apply(_all_bands)

    def _collection_defs(self):
        return [CollectionDef(
            collection=ee.ImageCollection('ASTER/AST_L1T_003').filter(self._create_image_filter()),
            bands=_all_bands,
            normalizer=self.normalize
        )]

    @abstractmethod
    def _create_image_filter(self):
        """Creates an ee.Filter based on the spec.

        :return: A ee.Filter
        :rtype: ee.Filter
        """
        raise AssertionError('Method in subclass expected to have been invoked')


class AsterAutomaticMosaicSpec(AsterMosaicSpec):
    def __init__(self, spec):
        super(AsterAutomaticMosaicSpec, self).__init__(spec)

    def _create_image_filter(self):
        """Creates a filter, removing all scenes outside of area of interest and outside of date range.

        :return: An ee.Filter.
        """
        bounds_filter = ee.Filter.geometry(self.aoi.geometry())
        date_filter = ee.Filter.date(self.from_date, self.to_date)
        image_filter = ee.Filter.And(
            bounds_filter,
            date_filter,
            ee.Filter.listContains('ORIGINAL_BANDS_PRESENT', 'B01'),
            ee.Filter.listContains('ORIGINAL_BANDS_PRESENT', 'B02'),
            ee.Filter.listContains('ORIGINAL_BANDS_PRESENT', 'B3N'),
            ee.Filter.listContains('ORIGINAL_BANDS_PRESENT', 'B04'),
            ee.Filter.listContains('ORIGINAL_BANDS_PRESENT', 'B05'),
            ee.Filter.listContains('ORIGINAL_BANDS_PRESENT', 'B10')
        )
        return image_filter

    def __str__(self):
        return 'aster.AutomaticMosaicSpec(' + str(self.spec) + ')'


class AsterManualMosaicSpec(AsterMosaicSpec):
    def __init__(self, spec):
        super(AsterManualMosaicSpec, self).__init__(spec)
        self.spec = spec
        self.sceneIds = spec['sceneIds']

        def acquisition(scene):
            date = datetime.strptime(scene[:8], '%Y%b%d')
            epoch = datetime.utcfromtimestamp(0)
            return (date - epoch).total_seconds() * 1000

        acquisition_timestamps = [acquisition(scene) for scene in self.sceneIds]
        self.from_date = min(acquisition_timestamps)
        self.to_date = max(acquisition_timestamps)

    def _create_image_filter(self):
        return ee.Filter.inList('system:index', ee.List(list(self.sceneIds)))

    def __str__(self):
        return 'aster.ManualMosaicSpec(' + str(self.spec) + ')'


_all_bands = {'green': 'B01', 'red': 'B02', 'nir': 'B3N', 'swir1': 'B04', 'swir2': 'B05', 'thermal': 'B10'}
