import _strptime
from abc import abstractmethod

import ee
from datetime import datetime

from analyze import Analyze
from ..dates import millis_to_date
from ..mosaic import DataSet
from ..mosaic_spec import MosaicSpec

str(_strptime.__all__)  # Workaround for "Failed to import _strptime because the import lock is held by another thread."


class Sentinel2MosaicSpec(MosaicSpec):
    def __init__(self, spec):
        super(Sentinel2MosaicSpec, self).__init__(spec)
        self.set_scale()
        self.brdf_correct = False
        self.surface_reflectance = False
        self.masked_on_analysis = False

    def set_scale(self):
        if self.bands:
            self.scale = min([
                resolution
                for band, resolution
                in _scale_by_band.iteritems()
                if band in self.bands
            ])
        else:
            self.scale = 10

    def _data_sets(self):
        return [Sentinel2DataSet(self._create_image_filter())]

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
        image_filter = ee.Filter.And(
            ee.Filter.geometry(self.aoi.geometry()),
            self._date_filter()
        )
        return image_filter

    def __str__(self):
        return 'sentinel2.Sentinel2AutomaticMosaicSpec(' + str(self.spec) + ')'


class Sentinel2ManualMosaicSpec(Sentinel2MosaicSpec):
    def __init__(self, spec):
        super(Sentinel2ManualMosaicSpec, self).__init__(spec)
        self.scene_ids = [scene['id'] for sublist in spec['recipe']['model']['scenes'].values() for scene in sublist]

        def acquisition(scene):
            date = datetime.strptime(scene[:8], '%Y%m%d')
            epoch = datetime.utcfromtimestamp(0)
            return (date - epoch).total_seconds() * 1000

        acquisition_timestamps = [acquisition(scene) for scene in self.scene_ids]
        self.from_date = millis_to_date(min(acquisition_timestamps))
        self.to_date = millis_to_date(max(acquisition_timestamps))

    def _create_image_filter(self):
        return ee.Filter.inList('system:index', ee.List(list(self.scene_ids)))

    def __str__(self):
        return 'sentinel.Sentinel2ManualMosaicSpec(' + str(self.spec) + ')'


_scale_by_band = {
    'aerosol': 60,
    'blue': 10,
    'green': 10,
    'red': 10,
    'redEdge1': 20,
    'redEdge2': 20,
    'redEdge3': 20,
    'nir': 10,
    'redEdge4': 20,
    'waterVapor': 60,
    'cirrus': 60,
    'swir1': 20,
    'swir2': 20,
    'dayOfYear': 10,
    'daysFromTarget': 10,
    'unixTimeDays': 10
}


class Sentinel2DataSet(DataSet):
    def __init__(self, image_filter):
        super(Sentinel2DataSet, self).__init__()
        self.image_filter = image_filter

    def to_collection(self):
        return ee.ImageCollection('COPERNICUS/S2').filter(self.image_filter)

    def analyze(self, image):
        return Analyze(image, self.bands()).apply()

    def bands(self):
        return {
            'aerosol': 'B1',
            'blue': 'B2',
            'green': 'B3',
            'red': 'B4',
            'redEdge1': 'B5',
            'redEdge2': 'B6',
            'redEdge3': 'B7',
            'nir': 'B8',
            'redEdge4': 'B8A',
            'waterVapor': 'B9',
            'cirrus': 'B10',
            'swir1': 'B11',
            'swir2': 'B12',
        }
