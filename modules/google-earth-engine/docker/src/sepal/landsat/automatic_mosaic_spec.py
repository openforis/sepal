import logging

import ee

import constants
from mosaic_spec import LandsatMosaicSpec


class AutomaticMosaicSpec(LandsatMosaicSpec):
    def __init__(self, spec):
        super(AutomaticMosaicSpec, self).__init__(spec)
        self.spec = spec
        self.sensors = spec['sensors']
        self.from_date = spec['fromDate']
        self.to_date = spec['toDate']

    def _ee_image(self):
        logging.info('Creating mosaic of ' + str(self))
        image_collections = self._create_image_collections()
        return self._create_mosaic(image_collections)

    def _create_image_collections(self):
        image_filter = self._create_image_filter()
        collection_names = self._convert_sepal_sensor_name_to_ee_collection_names()
        image_collections = [self._create_filtered_image_collection(name, image_filter) for name in collection_names]
        return image_collections

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
                map(lambda sensor: constants.collection_names_by_sensor[sensor], self.sensors)
            )
        )

    def _create_filtered_image_collection(self, collection_name, image_filter):
        """Creates an image collection, with the provided filter applied, with normalized band names.

        The band names will be normalized to B1, B2, B3, B4, B5, B7, B10.

        :param collection_name: A Google Earth Engine collection name.
        :type collection_name: str

        :param image_filter: They filter to apply.
        :type target_day_of_year: ee.Filter

        :return: An ee.ImageCollection().
        """
        filtered_collection = ee.ImageCollection(collection_name).filter(image_filter)
        normalized_collection = filtered_collection.map(
            lambda image: self._normalize_band_names(image, collection_name)
        )
        return normalized_collection

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
