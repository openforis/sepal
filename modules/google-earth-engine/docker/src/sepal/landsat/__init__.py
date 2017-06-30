import ee
from datetime import datetime
from itertools import groupby

from .. import MosaicSpec
from ..mosaic import CollectionDef


class LandsatMosaicSpec(MosaicSpec):
    def __init__(self, spec):
        super(LandsatMosaicSpec, self).__init__(spec)
        self.scale = 30


class LandsatAutomaticMosaicSpec(LandsatMosaicSpec):
    def __init__(self, spec):
        super(LandsatAutomaticMosaicSpec, self).__init__(spec)
        self.sensors = spec['sensors']

    def _collection_defs(self):
        image_filter = self._create_image_filter()
        collection_names = self._convert_sepal_sensor_name_to_ee_collection_names()
        return [self._collection_def(name, image_filter) for name in collection_names]

    def _collection_def(self, name, image_filter):
        return CollectionDef(
            collection=ee.ImageCollection(name).filter(image_filter),
            bands=_bands_by_collection_name[name]
        )

    def _create_image_filter(self):
        """Creates a filter, removing all scenes outside of area of interest and outside of date range.

        :return: An ee.Filter.
        """
        bounds_filter = ee.Filter.geometry(self.aoi.geometry())
        date_filter = ee.Filter.date(self.from_date, self.to_date)
        no_LO8_filter = ee.Filter.stringStartsWith('LO8').Not()
        image_filter = ee.Filter.And(
            bounds_filter,
            date_filter,
            no_LO8_filter
        )
        return image_filter

    def _convert_sepal_sensor_name_to_ee_collection_names(self):
        """Converts a list of Sepal sensor names to Google Earth Engine collection names.

        :return: A set of collection names.
        """
        return set(
            self._flatten(
                map(lambda sensor: _collection_names_by_sensor[sensor], self.sensors)
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

    def _collection_defs(self):
        scene_ids_by_collection_name = groupby(sorted(self.sceneIds), self._collection_name_of_scene)
        collection_defs = [self._collection_def(name, ids) for name, ids in
                           scene_ids_by_collection_name]
        return collection_defs

    def _collection_name_of_scene(self, scene_id):
        """Determines the collection name of the specified scene id.

        :param scene_id: The scene id to find collection name for.
        :type scene_id: str

        :return: A str with the collection name.
        """
        prefix = scene_id[:3]
        return _collection_name_by_scene_id_prefix[prefix]

    def _collection_def(self, collection_name, image_ids):
        return CollectionDef(
            collection=ee.ImageCollection(collection_name).filter(
                ee.Filter.inList('LANDSAT_SCENE_ID', ee.List(list(image_ids)))
            ),
            bands=_bands_by_collection_name[collection_name]
        )

    def __str__(self):
        return 'landsat.ManualMosaicSpec(' + str(self.spec) + ')'


_collection_names_by_sensor = {
    'LANDSAT_8': ['LANDSAT/LC08/C01/T1_TOA'],
    'LANDSAT_7': ['LANDSAT/LE07/C01/T1_TOA'],
    'LANDSAT_TM': ['LANDSAT/LT4_L1T_TOA', 'LANDSAT/LT5_L1T_TOA'],
}
_bands_by_collection_name = {
    'LANDSAT/LC08/C01/T1_TOA': {
        'blue': 'B2', 'green': 'B3', 'red': 'B4', 'nir': 'B5', 'swir1': 'B6', 'swir2': 'B7', 'cirrus': 'B9',
        'thermal': 'B10'},
    'LANDSAT/LE07/C01/T1_TOA': {
        'blue': 'B1', 'green': 'B2', 'red': 'B3', 'nir': 'B4', 'swir1': 'B5', 'swir2': 'B7', 'thermal': 'B6_VCID_1'},
    'LANDSAT/LT5_L1T_TOA': {
        'blue': 'B1', 'green': 'B2', 'red': 'B3', 'nir': 'B4', 'swir1': 'B5', 'swir2': 'B7', 'thermal': 'B6'},
    'LANDSAT/LT4_L1T_TOA': {
        'blue': 'B1', 'green': 'B2', 'red': 'B3', 'nir': 'B4', 'swir1': 'B5', 'swir2': 'B7', 'thermal': 'B6'}
}
_collection_name_by_scene_id_prefix = {
    'LC8': 'LANDSAT/LC08/C01/T1_TOA',
    'LE7': 'LANDSAT/LE07/C01/T1_TOA',
    'LT5': 'LANDSAT/LT5_L1T_TOA',
    'LT4': 'LANDSAT/LT4_L1T_TOA',
}
