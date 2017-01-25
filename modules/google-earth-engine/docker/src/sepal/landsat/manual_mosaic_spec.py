import logging

import ee
from datetime import datetime
from itertools import groupby

import constants
from mosaic_spec import LandsatMosaicSpec


class ManualMosaicSpec(LandsatMosaicSpec):
    def __init__(self, spec):
        super(ManualMosaicSpec, self).__init__(spec)
        self.spec = spec
        self.sceneIds = spec['sceneIds']

        def acquisition(scene):
            date = datetime.strptime(scene[9:16], '%Y%j')
            return (date - constants.epoch).total_seconds() * 1000

        acquisition_timestamps = [acquisition(scene) for scene in self.sceneIds]
        self.from_date = min(acquisition_timestamps)
        self.to_date = max(acquisition_timestamps)

    def _ee_image(self):
        """
        Creates a cloud-free mosaic, selecting scenes based on provided ids.

        :return: cloud-free mosaic, clipped to the area of interest, contains the specified bands."""
        logging.info('Creating mosaic of ' + str(self))
        image_collections = self._create_image_collections()
        mosaic = self._create_mosaic(image_collections)
        return mosaic

    def _create_image_collections(self):
        scene_ids_by_collection_name = groupby(sorted(self.sceneIds), self._collection_name_of_scene)
        image_collections = [self._create_image_collection(name, ids) for name, ids in scene_ids_by_collection_name]
        return image_collections

    def _collection_name_of_scene(self, scene_id):
        """Determines the collection name of the specified scene id.

        :param scene_id: The scene id to find collection name for.
        :type scene_id: str

        :return: A str with the collection name.
        """
        prefix = scene_id[:3]
        return constants.collection_name_by_scene_id_prefix[prefix]

    def _create_image_collection(self, collection_name, image_ids):
        """Creates an image collection containing images with the specified ids.

        The band names will be normalized to B1, B2, B3, B4, B5, B7, B10.

        :param collection_name: A Google Earth Engine collection name.
        :type collection_name: str

        :param image_ids: They ids of the images to include in the collection.
        :type image_ids: iterable

        :return: An ee.ImageCollection().
        """
        image_id_list = ee.List(list(image_ids))
        collection = ee.ImageCollection(collection_name).filter(
            ee.Filter.inList('system:index', image_id_list)
        )
        normalized_collection = collection.map(
            lambda image: self._normalize_band_names(image, collection_name)
        )
        return normalized_collection

    def __str__(self):
        return 'landsat.ManualMosaicSpec(' + str(self.spec) + ')'
