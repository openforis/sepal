import logging

import ee
from datetime import datetime

import constants
from mosaic_spec import Sentinel2MosaicSpec


class Sentinel2ManualMosaicSpec(Sentinel2MosaicSpec):
    def __init__(self, spec):
        super(Sentinel2ManualMosaicSpec, self).__init__(spec)
        self.spec = spec
        self.scene_ids = spec['sceneIds']

        def acquisition(scene):
            date = datetime.strptime(scene[14:14 + 8], '%Y%m%d')
            return (date - constants.epoch).total_seconds() * 1000

        acquisition_timestamps = [acquisition(scene) for scene in self.scene_ids]
        self.from_date = min(acquisition_timestamps)
        self.to_date = max(acquisition_timestamps)

    def _ee_image(self):
        """
        Creates a cloud-free mosaic, selecting scenes based on provided ids.

        :return: cloud-free mosaic, clipped to the area of interest, contains the specified bands."""
        logging.info('Creating mosaic of ' + str(self))
        image_collection = self._create_image_collection()
        return self._create_mosaic(image_collection)

    def _create_image_collection(self, ):
        """Creates an image collection containing specified scene ids.
        :return: An ee.ImageCollection().
        """
        image_id_list = ee.List(list(self.scene_ids))
        return ee.ImageCollection(constants.collection_name).filter(
            ee.Filter.inList('GRANULE_ID', image_id_list)
        )

    def __str__(self):
        return 'sentinel.Sentinel2ManualMosaicSpec(' + str(self.spec) + ')'
