import _strptime

import ee
from datetime import datetime
from itertools import groupby

from analyze import Analyze
from ..mosaic import DataSet
from ..mosaic_spec import MosaicSpec

str(_strptime.__all__)  # Workaround for "Failed to import _strptime because the import lock is held by another thread."


class LandsatMosaicSpec(MosaicSpec):
    def __init__(self, spec):
        super(LandsatMosaicSpec, self).__init__(spec)
        collections = _sr if self.surface_reflectance else _toa
        self._collection_names_by_scene_id_prefix = collections['collection_names_by_scene_id_prefix']
        self._collection_names_by_sensor = collections['collection_names_by_sensor']
        self.set_scale()

    def _data_set(self, collection_name, image_filter):
        return LandsatDataSet(collection_name, image_filter, self)

    def set_scale(self):
        if self.bands:
            self.scale = min([
                resolution
                for band, resolution
                in _scale_by_band.iteritems()
                if band in self.bands
            ])
        else:
            self.scale = 30


class LandsatAutomaticMosaicSpec(LandsatMosaicSpec):
    def __init__(self, spec):
        super(LandsatAutomaticMosaicSpec, self).__init__(spec)
        self.sensors = spec['sensors']

    def _data_sets(self):
        image_filter = ee.Filter.And(
            ee.Filter.geometry(self.aoi.geometry()),
            ee.Filter.date(self.from_date, self.to_date),
            ee.Filter.stringStartsWith('LO8').Not()
        )
        collection_names = self._convert_sepal_sensor_name_to_ee_collection_names()
        return [self._data_set(name, image_filter) for name in collection_names]

    def _convert_sepal_sensor_name_to_ee_collection_names(self):
        """Converts a list of Sepal sensor names to Google Earth Engine collection names.

        :return: A set of collection names.
        """
        return set(
            self._flatten(
                map(lambda sensor: self._collection_names_by_sensor[sensor], self.sensors)
            )
        )

    @staticmethod
    def _flatten(iterable):
        """Flattens the provided iterable.

        The provided iterable and any nested iterable have their contents added to a list.

        :param iterable: The iterable to flatten.
        :type iterable: iterable

        :return: A flattened list
        """
        return [item for sublist in iterable for item in sublist]

    def __str__(self):
        return 'landsat.AutomaticMosaicSpec(' + str(self.spec) + ')'


class LandsatManualMosaicSpec(LandsatMosaicSpec):
    def __init__(self, spec):
        super(LandsatManualMosaicSpec, self).__init__(spec)
        self.sceneIds = spec['sceneIds']

        def acquisition(scene):
            date = datetime.strptime(scene[9:16], '%Y%j')
            epoch = datetime.utcfromtimestamp(0)
            return (date - epoch).total_seconds() * 1000

        acquisition_timestamps = [acquisition(scene) for scene in self.sceneIds]
        self.from_date = min(acquisition_timestamps)
        self.to_date = max(acquisition_timestamps)

    def _data_sets(self):
        scenes_by_scene_id_prefix = groupby(sorted(self.sceneIds), lambda scene_id: scene_id[:3])
        data_sets = []
        for prefix, ids in scenes_by_scene_id_prefix:
            ids = list(ids)
            for name in self._collection_names_by_scene_id_prefix[prefix]:
                data_sets.append(
                    self._data_set(
                        collection_name=name,
                        image_filter=ee.Filter.inList('LANDSAT_SCENE_ID', ee.List(list(ids))))
                )
        return data_sets

    def _collection_names_of_scene(self, scene_id):
        """Determines the collection name of the specified scene id.

        :param scene_id: The scene id to find collection name for.
        :type scene_id: str

        :return: A str with the collection name.
        """
        prefix = scene_id[:3]
        return self._collection_names_by_scene_id_prefix[prefix]

    def __str__(self):
        return 'landsat.ManualMosaicSpec(' + str(self.spec) + ')'


_toa = {
    'collection_names_by_sensor': {
        'LANDSAT_8': ('LANDSAT/LC08/C01/T1_TOA',),
        'LANDSAT_7': ('LANDSAT/LE07/C01/T1_TOA',),
        'LANDSAT_TM': ('LANDSAT/LT4_L1T_TOA_FMASK', 'LANDSAT/LT05/C01/T1_TOA'),
        'LANDSAT_8_T2': ('LANDSAT/LC08/C01/T2_TOA',),
        'LANDSAT_7_T2': ('LANDSAT/LE07/C01/T2_TOA',),
        'LANDSAT_TM_T2': ('LANDSAT/LT05/C01/T2_TOA',)
    },
    'collection_names_by_scene_id_prefix': {
        'LC8': ('LANDSAT/LC08/C01/T1_TOA', 'LANDSAT/LC08/C01/T2_TOA'),
        'LE7': ('LANDSAT/LE07/C01/T1_TOA', 'LANDSAT/LE07/C01/T2_TOA'),
        'LT5': ('LANDSAT/LT05/C01/T1_TOA', 'LANDSAT/LT05/C01/T2_TOA'),
        'LT4': ('LANDSAT/LT4_L1T_TOA_FMASK',)
    },
    'collection_name_by_data_set': {
        'landsat8': 'LANDSAT/LC08/C01/T1_TOA',
        'landsat7': 'LANDSAT/LE07/C01/T1_TOA',
        'landsat5': 'LANDSAT/LT05/C01/T1_TOA',
        'landsat8T2': 'LANDSAT/LC08/C01/T2_TOA',
        'landsat7T2': 'LANDSAT/LE07/C01/T2_TOA',
        'landsat5T2': 'LANDSAT/LT05/C01/T2_TOA'
    }
}

_sr = {
    'collection_names_by_sensor': {
        'LANDSAT_8': ('LANDSAT/LC08/C01/T1_SR',),
        'LANDSAT_7': ('LANDSAT/LE07/C01/T1_SR',),
        'LANDSAT_TM': ('LANDSAT/LT04/C01/T1_SR', 'LANDSAT/LT05/C01/T1_SR',)
    },
    'collection_names_by_scene_id_prefix': {
        'LC8': ('LANDSAT/LC08/C01/T1_SR',),
        'LE7': ('LANDSAT/LE07/C01/T1_SR',),
        'LT5': ('LANDSAT/LT05/C01/T1_SR',),
        'LT4': ('LANDSAT/LT04/C01/T1_SR',)
    },
    'collection_name_by_data_set': {
        'landsat8': 'LANDSAT/LC08/C01/T1_SR',
        'landsat7': 'LANDSAT/LE07/C01/T1_SR',
        'landsat5': 'LANDSAT/LT05/C01/T1_SR',
        'landsat4': 'LANDSAT/LT04/C01/T1_SR'
    }
}


class LandsatDataSet(DataSet):
    def __init__(self, collection_name, image_filter, mosaic_spec):
        super(LandsatDataSet, self).__init__()
        self.collection_name = collection_name
        self.image_filter = image_filter
        self.mosaic_spec = mosaic_spec

    @staticmethod
    def create(data_set_name, image_filter, mosaic_spec):
        collections = _sr if mosaic_spec.surface_reflectance else _toa
        return LandsatDataSet(
            collections['collection_name_by_data_set'][data_set_name],
            image_filter,
            mosaic_spec)

    def to_collection(self):
        return ee.ImageCollection(self.collection_name).filter(self.image_filter)

    def analyze(self, image):
        return Analyze(image, self.bands(), self.mosaic_spec).apply()

    def bands(self):
        return {
            'LANDSAT/LC08/C01/T1_TOA': {
                'aerosol': 'B1', 'blue': 'B2', 'green': 'B3', 'red': 'B4', 'nir': 'B5', 'swir1': 'B6', 'swir2': 'B7',
                'pan': 'B8', 'cirrus': 'B9', 'thermal': 'B10', 'thermal2': 'B11', 'BQA': 'BQA'},
            'LANDSAT/LE07/C01/T1_TOA': {
                'blue': 'B1', 'green': 'B2', 'red': 'B3', 'nir': 'B4', 'swir1': 'B5',
                'thermal': 'B6_VCID_1', 'thermal2': 'B6_VCID_2', 'swir2': 'B7', 'pan': 'B8', 'BQA': 'BQA'},
            'LANDSAT/LT05/C01/T1_TOA': {
                'blue': 'B1', 'green': 'B2', 'red': 'B3', 'nir': 'B4', 'swir1': 'B5', 'thermal': 'B6', 'swir2': 'B7',
                'BQA': 'BQA'},
            'LANDSAT/LT4_L1T_TOA_FMASK': {
                'blue': 'B1', 'green': 'B2', 'red': 'B3', 'nir': 'B4', 'swir1': 'B5', 'thermal': 'B6', 'swir2': 'B7',
                'fmask': 'fmask'},
            'LANDSAT/LC08/C01/T2_TOA': {
                'aerosol': 'B1', 'blue': 'B2', 'green': 'B3', 'red': 'B4', 'nir': 'B5', 'swir1': 'B6', 'swir2': 'B7',
                'pan': 'B8', 'cirrus': 'B9', 'thermal': 'B10', 'thermal2': 'B11', 'BQA': 'BQA'},
            'LANDSAT/LE07/C01/T2_TOA': {
                'blue': 'B1', 'green': 'B2', 'red': 'B3', 'nir': 'B4', 'swir1': 'B5',
                'thermal': 'B6_VCID_1', 'thermal2': 'B6_VCID_2', 'swir2': 'B7', 'pan': 'B8', 'BQA': 'BQA'},
            'LANDSAT/LT05/C01/T2_TOA': {
                'blue': 'B1', 'green': 'B2', 'red': 'B3', 'nir': 'B4', 'swir1': 'B5', 'thermal': 'B6', 'swir2': 'B7',
                'BQA': 'BQA'},
            'LANDSAT/LC08/C01/T1_SR': {
                'aerosol': 'B1', 'blue': 'B2', 'green': 'B3', 'red': 'B4', 'nir': 'B5', 'swir1': 'B6', 'swir2': 'B7',
                'thermal': 'B10', 'thermal2': 'B11', 'pixel_qa': 'pixel_qa'},
            'LANDSAT/LE07/C01/T1_SR': {
                'blue': 'B1', 'green': 'B2', 'red': 'B3', 'nir': 'B4', 'swir1': 'B5',
                'thermal': 'B6', 'swir2': 'B7', 'pixel_qa': 'pixel_qa'},
            'LANDSAT/LT05/C01/T1_SR': {
                'blue': 'B1', 'green': 'B2', 'red': 'B3', 'nir': 'B4', 'swir1': 'B5', 'thermal': 'B6', 'swir2': 'B7',
                'pixel_qa': 'pixel_qa'},
            'LANDSAT/LT04/C01/T1_SR': {
                'blue': 'B1', 'green': 'B2', 'red': 'B3', 'nir': 'B4', 'swir1': 'B5', 'thermal': 'B6', 'swir2': 'B7',
                'pixel_qa': 'pixel_qa'},
        }[self.collection_name]


_scale_by_band = {
    'aerosol': 30,
    'blue': 30,
    'green': 30,
    'red': 30,
    'nir': 30,
    'swir1': 30,
    'swir2': 30,
    'pan': 15,
    'cirrus': 30,
    'thermal': 100,
    'thermal2': 100,
    'dayOfYear': 30,
    'daysFromTarget': 30,
    'unixTimeDays': 30
}
