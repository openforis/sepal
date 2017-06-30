from abc import abstractmethod

import ee
from datetime import datetime

from .. import MosaicSpec
from ..mosaic import CollectionDef


class Sentinel2MosaicSpec(MosaicSpec):
    def __init__(self, spec):
        super(Sentinel2MosaicSpec, self).__init__(spec)
        self.scale = min([
            resolution
            for band, resolution
            in _scale_by_band.iteritems()
            if band in self.bands
        ])

    def _collection_defs(self):
        return [CollectionDef(
            collection=ee.ImageCollection('COPERNICUS/S2')
                .filter(self._create_image_filter()),
            bands=_all_bands,
            normalizer=self._normalize

        )]

    def _normalize(self, image):
        return image.divide(10000)

    @abstractmethod
    def _create_image_filter(self):
        """Creates an ee.Filter based on the spec.

        :return: A ee.Filter
        :rtype: ee.Filter
        """
        raise AssertionError('Method in subclass expected to have been invoked')


class Sentinel2AutomaticMosaicSpec(Sentinel2MosaicSpec):
    def __init__(self, spec):
        super(Sentinel2AutomaticMosaicSpec, self).__init__(spec)

    def _create_image_filter(self):
        """Creates a filter, removing all scenes outside of area of interest and outside of date range.

        :return: An ee.Filter.
        """
        bounds_filter = ee.Filter.geometry(self.aoi.geometry())
        date_filter = ee.Filter.date(self.from_date, self.to_date)
        image_filter = ee.Filter.And(
            bounds_filter,
            date_filter
        )
        return image_filter

    def __str__(self):
        return 'sentinel2.Sentinel2AutomaticMosaicSpec(' + str(self.spec) + ')'


class Sentinel2ManualMosaicSpec(Sentinel2MosaicSpec):
    def __init__(self, spec):
        super(Sentinel2ManualMosaicSpec, self).__init__(spec)
        self.scene_ids = spec['sceneIds']

        def acquisition(scene):
            date = datetime.strptime(scene[:8], '%Y%m%d')
            epoch = datetime.utcfromtimestamp(0)
            return (date - epoch).total_seconds() * 1000

        acquisition_timestamps = [acquisition(scene) for scene in self.scene_ids]
        self.from_date = min(acquisition_timestamps)
        self.to_date = max(acquisition_timestamps)

    def _create_image_filter(self):
        return ee.Filter.inList('system:index', ee.List(list(self.scene_ids)))

    def __str__(self):
        return 'sentinel.Sentinel2ManualMosaicSpec(' + str(self.spec) + ')'


_all_bands = {
    'blue': 'B2',
    'green': 'B3',
    'red': 'B4',
    'nir': 'B8A',
    'swir1': 'B11',
    'swir2': 'B12',
    'cirrus': 'B10'}

_scale_by_band = {
    'blue': 10,
    'green': 10,
    'red': 10,
    'nir': 10,
    'swir1': 20,
    'swir2': 20,
    'dayOfYear': 10,
    'daysFromTarget': 10,
    'unixTimeDays': 10
}
