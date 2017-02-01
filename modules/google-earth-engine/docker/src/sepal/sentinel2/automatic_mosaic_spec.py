import logging

import ee

import constants
from mosaic_spec import Sentinel2MosaicSpec


class Sentinel2AutomaticMosaicSpec(Sentinel2MosaicSpec):
    def __init__(self, spec):
        super(Sentinel2AutomaticMosaicSpec, self).__init__(spec)
        self.spec = spec
        self.from_date = spec['fromDate']
        self.to_date = spec['toDate']

    def _ee_image(self):
        logging.info('Creating mosaic of ' + str(self))
        image_collection = self._create_image_collection()
        return self._create_mosaic(image_collection)

    def _create_image_collection(self):
        image_filter = self._create_image_filter()
        return ee.ImageCollection(constants.collection_name).filter(image_filter)

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
